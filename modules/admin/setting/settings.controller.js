import { Prisma } from "@prisma/client";
import multer from "../../../config/Multer.config";
import path from "path";
import fs from "fs";

// Get personal info
export const getPersonalInfo = async (req, res) => {
  try {
    const user = await Prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        name: true,
        email: true,
        dateOfBirth: true,
        address: true,
        country: true,
        city: true,
        state: true,
        postalCode: true,
        language: true,
        phone: true,
        bio: true,
        image: true,
      },
    });
    res.json(user, { message: "User information fetched successfully" });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch user information" });
    console.log("Error fetching user information:", err);
  }
};

// Update personal info
export const updatePersonalInfo = async (req, res) => {
  try {
    const {
      name,
      email,
      dateOfBirth,
      address,
      country,
      city,
      state,
      postalCode,
      language,
      phone,
      bio,
    } = req.body;
    const user = await Prisma.user.update({
      where: { id: req.user.id },
      data: {
        name,
        email,
        dateOfBirth,
        address,
        country,
        city,
        state,
        postalCode,
        language,
        phone,
        bio,
      },
    });
    res.json(user, { message: "User information updated successfully" });
  } catch (err) {
    res.status(500).json({ error: "Failed to update personal info" });
    console.log("Error updating personal info:", err);
  }
};

// Upload new profile image
export const uploadImage = [
  multer.single("image"),
  async (req, res) => {
    try {
      if (!req.file)
        return res.status(400).json({ error: "No image uploaded" });
      const imagePath = `/uploads/${req.file.filename}`;
      await Prisma.user.update({
        where: { id: req.user.id },
        data: { image: imagePath },
      });
      res.json(
        { image: imagePath },
        { message: "Image uploaded successfully" }
      );
    } catch (err) {
      res.status(500).json({ error: "Failed to upload image" });
      console.log("Error uploading image:", err);
    }
  },
];

// Delete profile image
export const deleteImage = async (req, res) => {
  try {
    const user = await Prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user || !user.image)
      return res.status(404).json({ error: "No image found" });
    const imagePath = path.join(__dirname, "../../../..", user.image);
    if (fs.existsSync(imagePath)) {
      fs.unlinkSync(imagePath);
    }
    await Prisma.user.update({
      where: { id: req.user.id },
      data: { image: null },
    });
    res.json({ message: "Image deleted" });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete image" });
    console.log("Error deleting image:", err);
  }
};
