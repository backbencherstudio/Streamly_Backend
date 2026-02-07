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


            // socket.on("notification", (userId)=>{
            //    io.to(userId).emit("notification", { message: "This is a test notification", timestamp: new Date() });
            // })

            socket.on("disconnect", () => {
                console.log(`Socket ${socket.id} disconnected for user ${userId}`);
                delete userIdSocketMap[userId];
            });
        });
    } catch (error) {
        console.log("Socket connection error:", error);
    }
};

const emitRealtime = (receiverId, payload) => {
    try {
        if (!io) return;
        io.to(receiverId).emit("notification", payload);
    } catch (error) {
        console.error("Error emitting realtime notification:", error);
    }
};

export const storeNotification = async ({
    receiverId,
    text,
    type = "system",
    senderId = null,
    entityId = null,
}) => {
    if (!receiverId || !text) return null;

    try {
        const notificationEvent = await prisma.notificationEvent.create({
            data: {
                type,
                text,
            },
        });

        const notification = await prisma.notification.create({
            data: {
                sender_id: senderId,
                receiver_id: receiverId,
                notification_event_id: notificationEvent.id,
                entity_id: entityId,
            },
        });

        return notification;
    } catch (error) {
        console.error("Error storing notification:", error);
        return null;
    }
};

export const sendNotification = async (arg1, arg2) => {
    // Legacy: sendNotification(userId, message)
    const params =
        typeof arg1 === "string" || typeof arg1 === "number"
            ? { receiverId: String(arg1), text: arg2, type: "system" }
            : arg1;

    const {
        receiverId,
        text,
        type = "system",
        senderId = null,
        entityId = null,
    } = params || {};

    if (!receiverId || !text) return null;

    const payload = {
        message: text,
        type,
        entity_id: entityId,
        timestamp: new Date(),
    };

    emitRealtime(receiverId, payload);
    return await storeNotification({ receiverId, text, type, senderId, entityId });
};

export const sendNotifications = async ({
    receiverIds,
    text,
    type = "system",
    senderId = null,
    entityId = null,
}) => {
    if (!Array.isArray(receiverIds) || receiverIds.length === 0) return [];

    const uniqueIds = [...new Set(receiverIds.filter(Boolean).map(String))];
    const results = [];

    for (const receiverId of uniqueIds) {
        // Sequential to avoid spiky DB load
        // eslint-disable-next-line no-await-in-loop
        const r = await sendNotification({ receiverId, text, type, senderId, entityId });
        results.push(r);
    }

    return results;
};

// Backward-compatible wrappers
export const sendWelcomeNotification = async (userId) => {
    await sendNotification({
        receiverId: userId,
        text: "Welcome to our platform! We're glad to have you.",
        type: "welcome",
    });
};

export const sendSimpleNotification = async (userId, message) => {
    await sendNotification({ receiverId: userId, text: message, type: "system" });
};