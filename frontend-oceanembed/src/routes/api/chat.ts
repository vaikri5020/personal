import { createFileRoute } from "@tanstack/react-router";

type ChatMessage = { role: "user" | "assistant"; content: string };

const SYSTEM_PROMPT = `You are the OceanEmbed Guide, a friendly in-app assistant for the OceanEmbed web app.
OceanEmbed reconstructs depth-wise subsurface ocean temperature (0-1000 m: 0, 5, 10, 20, 30, 50, 75, 100, 125, 150, 200, 300, 500, 700, 1000 m) for the North Indian Ocean (5N-30N, 45E-105E) at 0.25 deg daily resolution from surface satellite observations (SST, SSS, SSH/SLA, surface currents U/V, winds U/V).

Pages you can explain:
- Home: overview of the project and workflow.
- Dashboard: pick a point on the North Indian Ocean heatmap, see live surface readings (SST, currents, winds, waves), the vertical temperature profile, depth-wise values, time series, skill scores, and CSV export.
- Map: full-screen temperature heatmap with zoom.
- Analytics: skill metrics (RMSE, correlation, bias) and validation tables.
- Alerts: live watch board for marine heatwaves, cyclone-strength winds and high seas, with email opt-in per region.
- Kids (Ocean School): 3D ocean scene, depth zones, quiz and glossary for students.
- Settings: display and data preferences.
- Sign in / Sign up: account with email or username, password and an OTP code.

Answer questions about how to use the interface, what a chart or number means, and basic ocean science. Be thorough and educational (typically 3-6 sentences, up to 250 words, longer when the question warrants it), warm, and use short markdown lists when helpful. If asked about data not in the app, say plainly what is and is not available. Never invent numbers for the user's selected location.`;

const GEMINI_MODEL = "gemini-3.6-flash";

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const key = process.env["GEMINI_API_KEY"];
        if (!key) {
          return Response.json({ error: "Assistant is not configured." }, { status: 500 });
        }

        let messages: ChatMessage[] = [];
        try {
          const body = (await request.json()) as { messages?: ChatMessage[] };
          messages = Array.isArray(body.messages) ? body.messages.slice(-20) : [];
        } catch {
          return Response.json({ error: "Invalid request." }, { status: 400 });
        }
        if (messages.length === 0) {
          return Response.json({ error: "No message provided." }, { status: 400 });
        }

        const upstream = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-goog-api-key": key,
            },
            body: JSON.stringify({
              system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
              contents: messages.map((m) => ({
                role: m.role === "assistant" ? "model" : "user",
                parts: [{ text: String(m.content ?? "").slice(0, 4000) }],
              })),
              generationConfig: { maxOutputTokens: 1024, temperature: 0.7 },
            }),
          },
        );

        if (!upstream.ok) {
          const detail = await upstream.text();
          let message = "The assistant could not answer right now.";
          if (upstream.status === 429) message = "Too many questions at once — try again in a moment.";
          if (upstream.status === 400)
            message = "The assistant request was rejected. Check the API key and try again.";
          if (upstream.status === 403) message = "AI access is disabled for this key.";
          console.error("Gemini error", upstream.status, detail);
          return Response.json({ error: message }, { status: upstream.status });
        }

        const data = (await upstream.json()) as {
          candidates?: Array<{
            content?: { parts?: Array<{ text?: string }> };
            finishReason?: string;
          }>;
          promptFeedback?: { blockReason?: string };
        };

        const text = (data.candidates?.[0]?.content?.parts ?? [])
          .map((part) => part.text ?? "")
          .join("")
          .trim();

        return Response.json({ text: text || "Sorry, I didn't catch that. Could you rephrase?" });
      },
    },
  },
});
