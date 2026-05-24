import "dotenv/config";

import { createApp } from "./app.js";
import { getServerConfig } from "./config.js";

const config = getServerConfig();
const app = createApp({ config });

if (process.env.VERCEL !== "1") {
  app.listen(config.port, () => {
    console.log(`AI API (${config.attuneEnv}) listening on http://localhost:${config.port}`);
  });
}

export default app;
