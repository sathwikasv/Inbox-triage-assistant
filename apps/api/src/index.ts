import { connectDb } from "./db.js";
import { createApp } from "./app.js";

const port = Number(process.env.PORT ?? 4000);
connectDb()
  .then(() => createApp().listen(port, () => console.log(`api listening on :${port}`)))
  .catch((e) => {
    console.error("db connection failed:", e.message);
    process.exit(1);
  });
