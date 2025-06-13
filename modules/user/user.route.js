const express = require('express');
const router = express.Router(); // ✅ use "router" for clarity
const { registerUser } = require('./user.controller');
const { verifyUser } = require("../../middlewares/authUser");
// const upload = require("../../middleware/multer.config.single");

// Test route (optional)
// router.get("/check", verifyUser);
router.get('/test', (req, res) => {
    res.send('✅ User route connected');
  });
// Register route
router.post("/register", registerUser);

// ✅ Export the router properly!
module.exports = router;
