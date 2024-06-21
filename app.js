import express from "express"
import userRoute from "./routes/user.js"
import { connectDb } from "./utils/features.js";
import dotenv from "dotenv"
import chatRoute from "./routes/chat.js";
import adminRoute from "./routes/admin.js";
import { errorMiddleware } from "./middlewares/error.js";
import  cookieParser from "cookie-parser"
import {Server} from "socket.io"
import {createServer} from "http"
import {v2 as cloudinary} from "cloudinary"
import  cors from "cors"
import { creatUser, createGroupChats, createMessagesInAChat, createSingleChats } from "./seeder/user.js";
import { CHAT_JOINED, CHAT_LEAVED, NEW_MESSAGE, NEW_MESSAGE_ALERT, ONLINE_USERS, START_TYPING, STOP_TYPING } from "./constants/event.js";
dotenv.config({
    path:"./.env",
})


import { getSockets }  from "./lib/helper.js"; 
import {v4 as uuid} from "uuid"
import { Message } from "./models/message.js";
import { socketAuthenticator } from "./middlewares/auth.js";

export const envMode = process.env.NODE_ENV.trim() || "PRODUCTION";

const mongoURI=process.env.MONGO_URI;
const PORT= process.env.port || 3000;
export const adminSecretKey=process.env.ADMIN_SECRET_KEY || "ro"

const userSocketIDs = new Map();
const onlineUsers = new Set();


connectDb(mongoURI);

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});


const corsOptions = {
  origin: [
    "http://localhost:5173",
    "http://localhost:4173",
    // process.env.CLIENT_URL,
  ],
  methods: ["GET", "POST", "PUT", "DELETE"],
  credentials: true,
  // preflightContinue: true,
};

const app =express();
const server = createServer(app);
const io=new Server(server,{
  cors:corsOptions,
});

app.set("io",io);

app.use(cors(corsOptions));
app.use(express.json());
app.use(cookieParser());

app.options('*', cors(corsOptions));

app.use("/api/v1/user",userRoute)
app.use("/api/v1/chat",chatRoute)
app.use("/api/v1/admin",adminRoute)
app.get("/",(req,res) => {
    res.send("Hello Worls");
})


io.use((socket,next) => {
  cookieParser()(
    socket.request,
    socket.request.res,
    async (err) => await socketAuthenticator(err, socket, next)
  );
})

io.on("connection",(socket) => {
       
     // console.log("a user connected",socket.id);
      
      const user=socket.user;
     
      userSocketIDs.set(user._id.toString(), socket.id);

      socket.on(NEW_MESSAGE, async ({ chatId, members, message }) => {
        const messageForRealTime = {
          content: message,
          _id: uuid(),
          sender: {
            _id: user._id,
            name: user.name,
          },
          chat: chatId,
          createdAt: new Date().toISOString(),
        };
        
       //console.log(userSocketIDs);
    
        const messageForDB = {
          content: message,
          sender: user._id,
          chat: chatId,
        };
      
       
        const membersSocket = getSockets(members);
        
        io.to(membersSocket).emit(NEW_MESSAGE, {
          chatId,
          message: messageForRealTime,
        });
        io.to(membersSocket).emit(NEW_MESSAGE_ALERT, { chatId });
    
        try {
          await Message.create(messageForDB);
        } catch (error) {
          throw new Error(error);
        }
      });
    
      socket.on(START_TYPING, ({ members, chatId }) => {
        const membersSockets = getSockets(members);
        socket.to(membersSockets).emit(START_TYPING, { chatId });
      });
    
      socket.on(STOP_TYPING, ({ members, chatId }) => {
        const membersSockets = getSockets(members);
        socket.to(membersSockets).emit(STOP_TYPING, { chatId });
      });
    
      socket.on(CHAT_JOINED, ({ userId, members }) => {
        onlineUsers.add(userId.toString());
    
        const membersSocket = getSockets(members);
        io.to(membersSocket).emit(ONLINE_USERS, Array.from(onlineUsers));
      });
    
      socket.on(CHAT_LEAVED, ({ userId, members }) => {
        onlineUsers.delete(userId.toString());
    
        const membersSocket = getSockets(members);
        io.to(membersSocket).emit(ONLINE_USERS, Array.from(onlineUsers));
      });
    
      socket.on("disconnect",() => {
        userSocketIDs.delete(user._id.toString());
        onlineUsers.delete(user._id.toString());
        socket.broadcast.emit(ONLINE_USERS, Array.from(onlineUsers));

       // console.log("user discomnnected");
      })
});



app.use(errorMiddleware);
server.listen(PORT,()=>{
    console.log(`server is running on port ${PORT} in ${envMode} mode`)
})


export {userSocketIDs}