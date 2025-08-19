import express from "express";
import mongoose from "mongoose";
import dotenv from "dotenv";
import cors from "cors";

import authRoutes from "./routes/auth.js";
import usersRoutes from "./routes/users.js";
import conversationsRoutes from "./routes/conversations.js";

dotenv.config({ quiet: true });

const app = express();

app.use(cors());
app.use(express.json());

app.use("/auth", authRoutes);
app.use("/users", usersRoutes);
app.use("/conversations", conversationsRoutes);

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB connected"))
  .catch((err) => console.error(err));

const PORT = process.env.PORT || 5060;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
