import express from "express";
import mongoose from "mongoose";
import dotenv from "dotenv";
import cors from "cors";
import { createServer } from "http";

import authRoutes from "./routes/auth.js";
import usersRoutes from "./routes/users.js";
import conversationsRoutes from "./routes/conversations.js";
import { setupSocket } from "./socket.js";

dotenv.config({ quiet: true });

const app = express();
const server = createServer(app);

app.use(cors());
app.use(express.json());

app.use("/auth", authRoutes);
app.use("/users", usersRoutes);
app.use("/conversations", conversationsRoutes);

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {})
  .catch((err) => console.error(err));

const io = setupSocket(server);

const PORT = process.env.PORT || 5060;
server.listen(PORT, () => {});
