import express from 'express';
import { PrismaClient } from '@prisma/client';


const prisma = new PrismaClient();
const r = express.Router();


export const createService = async (req, res) => {
  try {
    const { name, description, price, features, plan } = req.body;

    if (!name || !description || !price || !features || !plan) {
      return res.status(400).json({ message: "All fields are required" });
    }

    const newService = await prisma.services.create({
      data: {
        name,
        description,
        price: parseFloat(price),
        features: JSON.parse(features),
        plan,
      },
    });

    return res.status(201).json({
      success: true,
      message: "Service created successfully",
      data: newService,
    });
  } catch (error) {
    console.error('Error creating service:', error);
    return res.status(500).json({ message: "Internal Server Error", error: error.message });
  }
}

export const  getAllServices = async (req, res) => {
  try {
    const services = await prisma.services.findMany({
      orderBy: { created_at: 'desc' },
    });

    return res.status(200).json({
      success: true,
      data: services,
    });
  } catch (error) {
    console.error('Error fetching services:', error);
    return res.status(500).json({ message: "Internal Server Error", error: error.message });
  }
};


//create a categr=ory service
//cosnt 