"""
src/models/oceanembed_model.py

v2 changes, made in response to v1 losing to the Random Forest baseline
(0.924 vs 0.849 RMSE overall, and especially weak in deep water):

1. Flatten instead of GlobalAveragePooling2D. GAP collapses each feature map
   to a single number per channel - it throws away WHERE in the 5x5 patch
   something happened (gradient direction, which corner an eddy edge sits
   in). On a patch this small (5x5), there's no need to compress spatially
   at all before the decoder; Flatten keeps every conv activation.

2. A skip connection straight from the input patch's CENTER pixel to the
   decoder, bypassing the conv stack entirely. The Random Forest baseline
   only ever saw the center pixel and still won - this guarantees the CNN
   has access to at least that same information directly, rather than
   hoping the conv layers preserve it. The conv branch then only has to
   learn the ADDITIONAL value of spatial context on top of that, not
   reconstruct the point reading from scratch.

3. A deeper decoder with dropout (previously 2 plain Dense layers), since
   the model now has more to work with (flattened spatial features + skip
   connection) and needs the extra capacity to make use of it without
   overfitting.

NOTE - the other half of the deep-ocean/thermocline fix is NOT in this file:
targets need to be normalized per-depth before training (shallow ~0-30 C vs
deep ~5-10 C otherwise means shallow errors dominate the loss). That
normalization is data-dependent, so it lives in the training notebook
(05_cnn_model.ipynb), not here - see the "Normalize targets" section there.

Usage:
    from src.models.oceanembed_model import build_oceanembed_model

    model = build_oceanembed_model(patch_size=5, n_channels=7, n_depths=15)
    model.summary()
"""

from tensorflow.keras import layers, models, Input


def build_oceanembed_model(
    patch_size: int = 5,
    n_channels: int = 7,
    n_depths: int = 15,
    embedding_dim: int = 64,
    decoder_units=(128, 64, 32),
    dropout_rate: float = 0.2,
) -> models.Model:
    """Build the v2 CNN encoder + MLP decoder model.

    Parameters
    ----------
    patch_size : side length of the square surface patch (5 -> 5x5).
    n_channels : number of surface variables stacked as channels
                 (default 7: sst, sss, sla, ugos, vgos, eastward_wind,
                 northward_wind - must match the channel order used when
                 building the paired dataset in pairing.py).
    n_depths   : number of target depth levels to predict at once (15).
    embedding_dim : size of the flattened-conv-features embedding, before
                    it's concatenated with the center-pixel skip connection.
    decoder_units : hidden layer sizes for the MLP decoder.
    dropout_rate : dropout applied after each decoder hidden layer.
    """
    inputs = Input(shape=(patch_size, patch_size, n_channels), name="surface_patch")

    # --- skip connection: the raw center pixel, bypassing the CNN entirely ---
    center = patch_size // 2
    center_pixel = layers.Lambda(
        lambda x: x[:, center, center, :],
        output_shape=(n_channels,),
        name="center_pixel_skip",
    )(inputs)

    # --- CNN encoder ---
    # "same" padding throughout keeps the full 5x5 spatial extent - two
    # stacked 3x3 convs already give a 5x5 effective receptive field, which
    # covers the whole patch, so there's no benefit to going deeper here.
    x = layers.Conv2D(16, kernel_size=3, padding="same", activation="relu", name="conv1")(inputs)
    x = layers.BatchNormalization()(x)
    x = layers.Conv2D(32, kernel_size=3, padding="same", activation="relu", name="conv2")(x)
    x = layers.BatchNormalization()(x)

    # v2: Flatten, not GlobalAveragePooling2D - keeps spatial arrangement
    # instead of averaging it away. For a 5x5 patch with 32 channels this is
    # 800 features, which is small enough that Flatten is cheap here.
    x = layers.Flatten(name="encoder_flatten")(x)
    embedding = layers.Dense(embedding_dim, activation="relu", name="embedding")(x)

    # --- combine spatial embedding with the raw point-wise skip connection ---
    combined = layers.Concatenate(name="embedding_plus_skip")([embedding, center_pixel])

    # --- MLP decoder ---
    d = combined
    for i, units in enumerate(decoder_units):
        d = layers.Dense(units, activation="relu", name=f"decoder_dense{i+1}")(d)
        d = layers.Dropout(dropout_rate, name=f"decoder_dropout{i+1}")(d)

    outputs = layers.Dense(n_depths, activation="linear", name="depth_profile")(d)

    model = models.Model(inputs=inputs, outputs=outputs, name="OceanEmbed_v2")
    return model


if __name__ == "__main__":
    model = build_oceanembed_model()
    model.summary()
