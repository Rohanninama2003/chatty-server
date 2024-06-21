import { ErrorHandler } from "../utils/utility.js";
import { Chat } from "../models/chat.js";
import { deletFilesFromCloudinary, emitEvent, uploadFilesToCloudinary } from "../utils/features.js";
import { Message } from "../models/message.js";

import {
  ALERT,
  NEW_ATTACHMENT,
  NEW_MESSAGE,
  NEW_MESSAGE_ALERT,
  REFETCH_CHATS,
} from "../constants/event.js";
import mongoose from "mongoose";
import { getotherMember } from "../lib/helper.js";
const { models } = mongoose;
import { User } from "../models/user.js";

const newGroupChat = async (req, res, next) => {
  try {
    const { name, members } = req.body;

    if (members.length < 2)
      return next(new ErrorHandler("Group must have at least 3 members", 400));

    const allMembers = [...members, req.user];

    await Chat.create({
      name,
      groupChat: true,
      creator: req.user,
      members: allMembers,
    });

    emitEvent(req, ALERT, allMembers, `Welcome to ${name} Group`);
    emitEvent(req, REFETCH_CHATS, members);

    return res.status(201).json({
      success: true,
      message: "Group Chat Created",
    });
  } catch (error) {
    next(error);
  }
};

const getMyChats = async (req, res, next) => {
  try {
    const chats = await Chat.find({ members: req.user }).populate(
      "members",
      "name avatar"
    );

    const transformedChats = chats.map(({ _id, name, members, groupChat }) => {
      const otherMember = getotherMember(members, req.user);

      return {
        _id,
        groupChat,
        avatar: groupChat
          ? members.slice(0, 3).map(({ avatar }) => avatar.url)
          : [otherMember.avatar.url],
        name: groupChat ? name : otherMember.name,
        members: members.reduce((prev, curr) => {
          if (curr._id.toString() != req.user.toString()) {
            prev.push(curr._id);
          }

          return prev;
        }, []),
      };
    });

    return res.status(200).json({
      success: true,
      chats: transformedChats,
    });
  } catch (error) {
    next(error);
  }
};

const getMyGroups = async (req, res, next) => {
  try {
    const chats = await Chat.find({
      members: req.user,
      groupChat: true,
      creator: req.user,
    }).populate("members", "name avatar");

    const groups = chats.map(({ members, _id, groupChat, name }) => ({
      _id,
      groupChat,
      name,
      avatar: members.slice(0, 3).map(({ avatar }) => avatar.url),
    }));

    return res.status(200).json({
      success: true,
      groups,
    });
  } catch (error) {
    next(error);
  }
};

const addMembers = async (req, res, next) => {
  try {
    const { chatId, members } = req.body;

    if (!members || members.length < 1)
      return next(new ErrorHandler("please provide members", 400));

    const chat = await Chat.findById(chatId);

    if (!chat) return next(new ErrorHandler("chat Not Found", 404));
    if (!chat.groupChat)
      return next(new ErrorHandler("This is Not a Group Chat", 400));

    if (chat.creator.toString() !== req.user.toString())
      return next(new ErrorHandler("you are not allowded to add members", 403));

    const allNewMembersPromise = members.map((i) => User.findById(i, "name"));

    const allNewMembers = await Promise.all(allNewMembersPromise);

    const uniqMembers = allNewMembers
      .filter((i) => !chat.members.includes(i._id.toString()))
      .map((i) => i._id);

    chat.members.push(...uniqMembers);

    if (chat.members.length > 100)
      return next(new ErrorHandler("Group Members Limit reached", 400));

    await chat.save();

    const allUsersName = allNewMembers.map((i) => i.name).join(",");

    emitEvent(
      req,
      ALERT,
      chat.members,
      {message:`${allUsersName} has been added to the group`,chatId}
    );
    emitEvent(req, REFETCH_CHATS, chat.members);

    return res.status(200).json({
      success: true,
      message: "Members added successfully",
    });
  } catch (error) {
    next(error);
  }
};

const removeMembers = async (req, res, next) => {
  try {
    const { userId, chatId } = req.body;
   console.log(" welcome back")
    const [chat, userThatWillBeRemoved] = await Promise.all([
      Chat.findById(chatId),
      User.findById(userId, "name"),
    ]);
  
    if (!chat) return next(new ErrorHandler("Chat not found", 404));
  
    if (!chat.groupChat)
      return next(new ErrorHandler("This is not a group chat", 400));
  
    if (chat.creator.toString() !== req.user.toString())
      return next(new ErrorHandler("You are not allowed to add members", 403));
  
    if (chat.members.length <= 3)
      return next(new ErrorHandler("Group must have at least 3 members", 400));
  
    const allChatMembers = chat.members.map((i) => i.toString());
  
    chat.members = chat.members.filter(
      (member) => member.toString() !== userId.toString()
    );
  
    await chat.save();
  
    emitEvent(req, ALERT, chat.members, {
      message: `${userThatWillBeRemoved.name} has been removed from the group`,
      chatId,
    });
  
    emitEvent(req, REFETCH_CHATS, allChatMembers);
  
    return res.status(200).json({
      success: true,
      message: "Member removed successfully",
    });
  } catch (error) {
    next(error);
  }
};

const leaveGroup = async (req, res, next) => {
  try {
    const chatId = req.params.id;

    const chat = await Chat.findById(chatId);

    if (!chat) return next(new ErrorHandler("chat not found", 404));

    if (!chat.groupChat)
      return next(new ErrorHandler("This is Not a Group Chat", 400));

    const remainingMember = chat.members.filter(
      (member) => member.toString() !== req.user.toString()
    );

    if (remainingMember.length < 3)
      return next(
        new ErrorHandler("the group has to be at least three member", 400)
      );

    if (chat.creator.toString() === req.user.toString()) {
      const randomNumber = Math.floor(Math.random() * remainingMember.length);
      const newCreator = remainingMember[randomNumber];

      chat.creator = newCreator;
    }

    chat.members = remainingMember;

    const [user] = await Promise.all([
      User.findById(req.user, "name"),
      chat.save(),
    ]);

    emitEvent(req, ALERT, chat.members, { chatId,message:`User ${user} has left the group`});

    return res.status(200).json({
      success: true,
      message: "Leave Group successfully",
    });
  } catch (error) {
    next(error);
  }
};

// const sendAttachment = async (req, res, next) => {
//   try {
//     const { chatId } = req.body;
     
//     const files = req.files || [];

//     if (files.length < 1)
//       return next(new ErrorHandler("Please Upload Attachments", 400));
  
//     if (files.length > 5)
//       return next(new ErrorHandler("Files Can't be more than 5", 400));

//     const [chat, me] = await Promise.all([
//       Chat.findById(chatId),
//       User.findById(req.user, "name"),
//     ]);

//     if (!chat) return next(new ErrorHandler("chat not found", 404));

    

//     if (files.length < 1)
//       return next(new ErrorHandler("please provide attachment", 400));

//     const attachments = await uploadFilesToCloudinary(files);

//     const messageForRealtime = {
//       content: "",
//       attachments,
//       sender: {
//         _id: me._id,
//         name: me.name,
//       },
//       chat: chatId,
//     };

//     const messageFordb = {
//       content: "",
//       attachments,
//       sender: me._id,
//       chat: chatId,
//     };

//     const message = await Message.create(messageFordb);

//     emitEvent(req, NEW_ATTACHMENT, chat.members, {
//       message: messageForRealtime,
//       chatId,
//     });

//     emitEvent(req, NEW_MESSAGE_ALERT, chat.members, {
//       chatId,
//     });

//     return res.status(200).json({
//       success: true,
//       message,
//     });
//   } catch (error) {
//     next(error);
//   }
// };


const sendAttachment = async (req, res, next) => {
    try {
      const {chatId} = req.body;
       console.log("chat id in backend",chatId);
      const files = req.files || [];
      console.log("reached to the backend");
      if (files.length < 1)
        return next(new ErrorHandler("Please Upload Attachments", 400));
    
      if (files.length > 5)
        return next(new ErrorHandler("Files Can't be more than 5", 400));
    
      const [chat, me] = await Promise.all([
        Chat.findById(chatId),
        User.findById(req.user, "name"),
      ]);
    
      if (!chat) return next(new ErrorHandler("Chat not found", 404));
    
      if (files.length < 1)
        return next(new ErrorHandler("Please provide attachments", 400));
    
      //   Upload files here
      const attachments = await uploadFilesToCloudinary(files);
    
      const messageForDB = {
        content: "",
        attachments,
        sender: me._id,
        chat: chatId,
      };
    
      const messageForRealTime = {
        ...messageForDB,
        sender: {
          _id: me._id,
          name: me.name,
        },
      };
    
      const message = await Message.create(messageForDB);
    
      emitEvent(req, NEW_MESSAGE, chat.members, {
        message: messageForRealTime,
        chatId,
      });
    
      emitEvent(req, NEW_MESSAGE_ALERT, chat.members, { chatId });
    
      return res.status(200).json({
        success: true,
        messageForDB,
      });
    } catch (error) {
      next(error);
    }
};


const getChatDetails = async (req, res, next) => {
  try {
    if (req.query.populate === "true") {
      const chat = await Chat.findById(req.params.id)
        .populate("members", "name avatar")
        .lean();

      if (!chat) return next(new ErrorHandler("chat not found", 404));

      chat.members = chat.members.map(({ _id, name, avatar }) => ({
        _id,
        name,
        avatar: avatar.url,
      }));

      return res.status(200).json({
        success: true,
        chat,
      });
    } else {
      const chat = await Chat.findById(req.params.id);

      if (!chat) return next(new ErrorHandler("chat not found", 404));

      return res.status(200).json({
        success: true,
        chat,
      });
    }
  } catch (error) {
    next(error);
  }
};

const renameGroup = async (req, res, next) => {
  try {
    const chatId = req.params.id;
    const { name } = req.body;

    const chat = await Chat.findById(chatId);

    if (!chat) return next(new ErrorHandler("chat not found", 404));

    if (!chat.groupChat)
      return next(new ErrorHandler("This is Not a Group Chat", 400));

    if (chat.creator.toString() !== req.user.toString())
      return next(new ErrorHandler("you are not allowded rename group", 403));

    chat.name = name;

    await chat.save();

    emitEvent(req, REFETCH_CHATS, chat.members);

    return res.status(200).json({
      success: true,
      message: "Group renamed successfully",
    });
  } catch (error) {
    next(error);
  }
};

const deleteChat = async (req, res, next) => {
  try {
    const chatId = req.params.id;

    const chat = await Chat.findById(chatId);

    if (!chat) return next(new ErrorHandler("chat not found", 404));

    const members = chat.members;

    if (chat.groupChat && chat.creator.toString() !== req.user.toString())
      return next(
        new ErrorHandler("you are not allowded to delete group", 403)
      );

    if (!chat.groupChat && !chat.members.includes(req.user.toString())) {
      return next(
        new ErrorHandler("you are not allowded to delete the chat", 403)
      );
    }

    //delete all messages as well as attachments on clodinary

    const messagesWithAttachments = await Message.find({
      chat: chatId,
      attachments: { $exists: true, $ne: [] },
    });

    const public_ids = [];

    messagesWithAttachments.forEach(({ attachments }) => {
      attachments.forEach(({ public_id }) => {
        public_ids.push(public_id);
      });
    });

    await Promise.all([
      //deletFilesFromCloudinary(public_ids),
      chat.deleteOne(),
      Message.deleteMany({ chat: chatId }),
    ]);

    emitEvent(req, REFETCH_CHATS, members);

    return res.status(200).json({
      success: true,
      message: "chat deleted successfully",
    });
  } catch (error) {
    next(error);
  }
};

const getMessages = async (req, res, next) => {
  try {
    const chatId = req.params.id;

    const { page = 1 } = req.query;

    const limit = 20;
    const skip = (page - 1) * limit;
    
    const chat = await Chat.findById(chatId);

    if (!chat) return next(new ErrorHandler("Chat not found", 404));
  
    if (!chat.members.includes(req.user.toString()))
      return next(
        new ErrorHandler("You are not allowed to access this chat", 403)
      );
      
    const [message,totalMessagesCount] = await Promise.all([Message.find({ chat: chatId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("sender", "name")
      .lean(),Message.countDocuments({chat:chatId})]);
   
      const totalPages= Math.ceil(totalMessagesCount/limit) || 0;
    return res.status(200).json({
      success: true,
       message:message.reverse(),
       totalPages,
    });
  } catch (error) {
    next(error);
  }
};

export {
  newGroupChat,
  getMyChats,
  getMyGroups,
  addMembers,
  removeMembers,
  leaveGroup,
  sendAttachment,
  getChatDetails,
  renameGroup,
  deleteChat,
  getMessages,
};
