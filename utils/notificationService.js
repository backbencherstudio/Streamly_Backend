import { PrismaClient } from "@prisma/client";
import jwt from "jsonwebtoken";
const prisma = new PrismaClient();
let io;
export const userIdSocketMap = {};

export const setSocketServer = (socketIoInstance) => {
    io = socketIoInstance;
    initializeSocketEvents();
};

const initializeSocketEvents = () => {
    try {
        io.on("connection", (socket) => {
            const token = socket.handshake.headers.auth;
            let userId;
            
            try {
                userId = jwt.verify(token, process.env.JWT_SECRET).userId;
            } catch (error) {
                console.log("Invalid token:", error);
                socket.disconnect();
                return;
            }

            userIdSocketMap[userId] = socket.id;
            
            socket.join(userId);
            console.log(`User ${userId} joined room: ${userId}`);

            socket.on("disconnect", () => {
                console.log(`Socket ${socket.id} disconnected for user ${userId}`);
                delete userIdSocketMap[userId];
            });
        });
    } catch (error) {
        console.log("Socket connection error:", error);
    }
};

const storeNotification = async (userId, message) => {
    try {
        const notificationEvent = await prisma.notificationEvent.create({
            data: {
                type: "system",
                text: message,
                created_at: new Date(),
            },
        });

        await prisma.notification.create({
            data: {
                sender: {
                    connect: { id: 'cme7zzhds0000venwlry4129y' }, 
                },
                receiver: {
                    connect: { id: userId },
                },
                notification_event: {
                    connect: { id: notificationEvent.id },
                },
            },
        });
    } catch (error) {
        console.error("Error storing notification:", error);
    }
};

export const sendNotification = async (userId, message) => {
    try {
        io.to(userId).emit("notification", {
            message: message,
            timestamp: new Date(),
        });
        
        console.log("Notification sent to user:", userId);
        await storeNotification(userId, message);
    } catch (error) {
        console.error("Error sending notification:", error);
    }
};

export const sendWelcomeNotification = async (userId) => {
    await sendNotification(userId, "Welcome to our platform! We're glad to have you.");
};