import express from "express";
import { isAuthenticated } from "../middlewares/auth.js";
import {
  addMembers,
  deleteChat,
  getChatDetails,
  getMessages,
  getMyChats,
  getMyGroups,
  leaveGroup,
  newGroupChat,
  removeMembers,
  renameGroup,
  sendAttachment,
} from "../controllers/chat.js";
import { attachmentMulter } from "../middlewares/multer.js";
import {
  addMemberValidator,
  chatIdValidator,
  newGroupValidator,
  removeMemberValidator,
  renameValidator,
  sendAttachmentsValidator,
  validateHandle,
} from "../lib/validators.js";

const app = express.Router();

//after this user must be logees in
app.use(isAuthenticated);

app.post("/new", newGroupValidator(), validateHandle, newGroupChat);
app.get("/my", getMyChats);
app.get("/my/groups", getMyGroups);
app.put("/addmembers", addMemberValidator(), validateHandle, addMembers);
app.put(
  "/removemembers",
  removeMemberValidator(),
  validateHandle,
  removeMembers
);
app.delete("/leave/:id", chatIdValidator(), validateHandle, leaveGroup);

app.post(
  "/message",
  attachmentMulter,
   sendAttachmentsValidator(),
   validateHandle,
  sendAttachment
);

app.get("/message/:id", chatIdValidator(), validateHandle, getMessages);

app
  .route("/:id")
  .get(chatIdValidator(), validateHandle, getChatDetails)
  .put(renameValidator(), validateHandle, renameGroup)
  .delete(chatIdValidator(), validateHandle, deleteChat);
export default app;
