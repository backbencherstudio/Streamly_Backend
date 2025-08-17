import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export const createFavourite = async (req, res) => {
  try {
    const { userId } = req.user; 
    console.log("User ID", userId);
    const { contentId } = req.body;

    const contentExists = await prisma.content.findUnique({
      where: { id: contentId },
      include: {
        Rating: true, 
        category: true,
      },
    });

    if (!contentExists) {
      return res.status(404).json({ error: "Content not found" });
    }

    const existingFavourite = await prisma.favourite.findFirst({
      where: {
        user_id: userId,
        content_id: contentId,
      },
    });

    if (existingFavourite) {
      return res
        .status(400)
        .json({ error: "Content already marked as favourite" });
    }

    const favourite = await prisma.favourite.create({
      data: {
        user_id: userId,
        content_id: contentId,
        category_id: contentExists.category.id, 
        title: contentExists.title, 
        thumbnail: contentExists.thumbnail,
        description: contentExists.description,
        rating:
          contentExists.Rating.length > 0
            ? contentExists.Rating[0].rating
            : null, 
      },
    });

    res.status(201).json(favourite);
  } catch (error) {
    console.error("Error creating favourite:", error);
    res
      .status(500)
      .json({ error: "Failed to create favourite", details: error.message });
  }
};

export const getFavourites = async (req, res) => {
  try {
    const { userId } = req.user;

    console.log("Fetching favourites for user:", userId);

    const favourites = await prisma.favourite.findMany({
      where: { user_id: userId },
      include: {
        content: {
          select: {
            id: true,
            title: true,
            description: true,
            thumbnail: true,
          },
        },
      },
    });

    if (favourites.length === 0) {
      return res.status(404).json({ message: "No favourites found" });
    }

    res.status(200).json(favourites);
  } catch (error) {
    console.error("Error retrieving favourites:", error);
    res
      .status(500)
      .json({ error: "Failed to retrieve favourites", details: error.message });
  }
};
