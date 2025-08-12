import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export const createFavourite = async (req, res) => {
  try {
    const { userId } = req.user; // userId comes from the authenticated user (via middleware)
    console.log("User ID", userId);
    const { contentId } = req.body;

    // Check if the content exists
    const contentExists = await prisma.content.findUnique({
      where: { id: contentId },
      include: {
        Rating: true, // Include ratings associated with the content
        category: true, // Include the category for the content
      },
    });

    if (!contentExists) {
      return res.status(404).json({ error: "Content not found" });
    }

    // Check if the content is already favourited by the user
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

    // Create the favourite
    const favourite = await prisma.favourite.create({
      data: {
        user_id: userId,
        content_id: contentId,
        category_id: contentExists.category.id, // Get the category_id for the content
        title: contentExists.title, // Set content title
        thumbnail: contentExists.thumbnail, // Set content thumbnail
        description: contentExists.description, // Set content description
        rating:
          contentExists.Rating.length > 0
            ? contentExists.Rating[0].rating
            : null, // Get the first rating if available
      },
    });

    res.status(201).json(favourite); // Return the created favourite
  } catch (error) {
    console.error("Error creating favourite:", error);
    res
      .status(500)
      .json({ error: "Failed to create favourite", details: error.message });
  }
};

export const getFavourites = async (req, res) => {
  try {
    const { userId } = req.user; // userId comes from the authenticated user

    console.log("Fetching favourites for user:", userId);

    // Retrieve all favourites of the user with related content
    const favourites = await prisma.favourite.findMany({
      where: { user_id: userId },
      include: {
        content: {
          select: {
            // Using select to control which fields are returned
            id: true,
            title: true,
            description: true,
            thumbnail: true,
            // You can also include other fields if needed
          },
        },
      },
    });

    // If no favourites are found, return a message
    if (favourites.length === 0) {
      return res.status(404).json({ message: "No favourites found" });
    }

    // Return the list of favourites
    res.status(200).json(favourites);
  } catch (error) {
    console.error("Error retrieving favourites:", error);
    res
      .status(500)
      .json({ error: "Failed to retrieve favourites", details: error.message });
  }
};
