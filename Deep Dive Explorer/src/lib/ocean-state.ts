// Shared mutable scroll state (no React re-renders — read inside useFrame).
export const oceanState = {
  // 0 = surface, 1 = seafloor
  progress: 0,
};

export const SURFACE_Y = 0;
export const FLOOR_Y = -140;
export const MAX_DEPTH_METERS = 2000;
