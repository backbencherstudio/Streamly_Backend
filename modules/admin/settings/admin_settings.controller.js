import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const deactivateAccount = async (req, res) => {
  const { userId } = req.params;
  const { deactivationPeriod } = req.body; // Period in days: 3, 7, 30, 365

  // Valid periods in days
  const validPeriods = [3, 7, 30, 365];
  
  if (!validPeriods.includes(deactivationPeriod)) {
    return res.status(400).json({ error: "Invalid deactivation period. Choose 3, 7, 30, or 365 days." });
  }

  try {
    // Calculate deactivation date
    const deactivationDate = new Date();
    deactivationDate.setDate(deactivationDate.getDate() + deactivationPeriod);

    // Update the user with deactivation status and the calculated deactivation date
    await prisma.user.update({
      where: { id: userId },
      data: {
        isActive: false, // Set the account to inactive
        deactivationDate: deactivationDate, // Store the deactivation date
      },
    });

    res.json({ message: `Account deactivated successfully for ${deactivationPeriod} days` });
  } catch (error) {
    console.error('Error deactivating account:', error);
    res.status(500).json({ error: 'Failed to deactivate account' });
  }
};


