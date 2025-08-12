import express from "express";
import { createFavourite, getFavourites } from "./favourite.controller.js";
import { verifyUser } from "../../middlewares/verifyUsers.js";

const router = express.Router();

router.post("/create", verifyUser("normal", "premium"), createFavourite);
router.get("/all-favourites", verifyUser("normal", "premium"), getFavourites);

export default router;
