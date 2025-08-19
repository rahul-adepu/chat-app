import express from "express";
import User from "../models/User.js";

const usersRouter = express.Router();

usersRouter.get("/", async (req, res) => {
  try {
    const users = await User.find({}, { password: 0, __v: 0 }).sort({ username: 1 });
    res.json(users);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

export default usersRouter;
