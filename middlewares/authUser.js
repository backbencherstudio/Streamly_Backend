const { verify } = require("jsonwebtoken");
const dotenv = require("dotenv");

dotenv.config();

const authUser = async (req, res, next) => {
const authHeader = req.headers.authorization;
if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Authentication invalid' });
}
const token = authHeader.split(' ')[1];

  console.log("Token from cookies:", token);
  const JWT_SECRET = process.env.WEBTOKEN_SECRET_KEY;

  if (!token) {
    res.status(400).json({
      message: "Unauthorized user",
    });
    return;
  }

  try {
    const decodedToken = verify(token, JWT_SECRET);
    req.userId = decodedToken.userId;
    console.log("Decoded Token:", decodedToken);
    next();
  } catch (error) {
    res.status(401).json({ message: "Invalid token" });
    return;
  }
};

module.exports = { authUser };
