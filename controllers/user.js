import { compare } from "bcrypt";
import { User } from "../models/user.js";
import { cookieOption, emitEvent, sendToken, uploadFilesToCloudinary } from "../utils/features.js";
import { ErrorHandler } from "../utils/utility.js";
import { Chat } from "../models/chat.js";
import { Request } from "../models/request.js";
import { NEW_REQUEST, REFETCH_CHATS } from "../constants/event.js";
import { getotherMember } from "../lib/helper.js";

const newUser = async (req, res,next) => {
  
  try {
    const { name, username, password, bio } = req.body;
  
    const file = req.file;
  
    if (!file) return next(new ErrorHandler("Please Upload Avatar"));
  
    const result = await uploadFilesToCloudinary([file]);

  const avatar = {
    public_id: result[0].public_id,
    url: result[0].url,
  };
  
    const user = await User.create({
      name,
      bio,
      username,
      password,
      avatar,
    });
  
    sendToken(res, user, 201, "User created");
  } catch (error) {
    next(error);
  }

 
};
const login = async (req, res, next) => {
  try {
    const { username, password } = req.body;

    const user = await User.findOne({ username }).select("+password");

    if (!user) return next(new ErrorHandler("Invalid Username ", 404));

    const isMatch = await compare(password, user.password);
    
   
    if (!isMatch) return next(new ErrorHandler("Invalid Password", 200));

    sendToken(res, user, 200, `Wecome back ${user.name}`);
  } catch (error) {
    next(error);
  }
};

const getMyProfile = async (req, res, next) => {
  try {
    const user = await User.findById(req.user).select("-password");

    if (!user) return next(new ErrorHandler("user not found", 404));

    res.status(200).json({
      success: true,
      user,
    });
  } catch (error) {
    next(error);
  }
};

const logout = async (req, res) => {
  try {
    return res
      .status(200)
      .cookie("chatty-token", "", { ...cookieOption, maxAge: 0 })
      .json({
        success: true,
        message: "Logged Out successfully",
      });
  } catch (error) {
    next(error);
  }
};

const searchUser = async (req, res) => {
  try {
    const { name = "" } = req.query;

    const myChats = await Chat.find({ groupChat: false, members: req.user });

    const allUsersFromMyChat = myChats.map((chat) => chat.members).flat();

    const allUsersExeptMeandFriends = await User.find({
      _id: { $nin: allUsersFromMyChat },
      name: { $regex: name, $options: "i" },
    });

    const users = allUsersExeptMeandFriends.map(({ _id, name, avatar }) => ({
      _id,
      name,
      avatar: avatar.url,
    }));
    return res.status(200).json({
      success: true,
      users,
    });
  } catch (error) {
    next(error);
  }
};

const sendFriendRequest = async (req, res, next) => {
  try {
    const { userId } = req.body;

    const request = await Request.findOne({
      $or: [
        { sender: req.user, receiver: userId },
        { sender: userId, receiver: req.user },
      ],
    });

    if (request) return next(new ErrorHandler("request already exists", 400));

    await Request.create({
      sender: req.user,
      receiver: userId,
    });

    emitEvent(req, NEW_REQUEST, [userId]);

    return res.status(200).json({
      success: true,
      message: "Friend Request Sent",
    });
  } catch (error) {
    next(error);
  }
};

const acceptFriendRequest = async (req, res, next) => {
  try {
    const { requestId, accept } = req.body;

    const request = await Request.findById(requestId)
      .populate("sender", "name")
      .populate("receiver", "name");

    if (!request) return next(new ErrorHandler("request Not Found", 404));

    if (request.receiver._id.toString() !== req.user.toString())
      return next(new ErrorHandler("tou are Unauthorised", 401));

    if (!accept) {
      await request.deleteOne();
      return res.status(200).json({
        success: true,
        message: "Friend Request Rejected",
      });
    }

    const members = [request.sender._id, request.receiver._id];

    await Promise.all([
      Chat.create({
        members,
        name: `${request.sender.name}-${request.receiver.name}`,
      }),
      request.deleteOne(),
    ]);

    emitEvent(req, REFETCH_CHATS, members);

    return res.status(200).json({
      success: true,
      message: "request accepted",
      senderId: request.sender._id,
    });
  } catch (error) {
    next(error);
  }
};

const getAllnotifications = async (req, res) => {
  try {
    const requests = await Request.find({ receiver: req.user }).populate(
      "sender",
      "name avatar"
    );

    const allRequest = requests.map(({ _id, sender }) => ({
      _id,
      sender: {
        _id: sender._id,
        name: sender.name,
        avatar: sender.avatar.url,
      },
    }));

    return res.status(200).json({
      success: true,
      allRequest,
    });
  } catch (error) {}
};

const getMyFriends = async (req, res) => {
  try {
    const chatId = req.query.chatId;

    const chats = await Chat.find({ members: req.user, groupChat: false }).populate("members","name avatar");

    const friends=chats.map(({members})=>{
        const otherUser=getotherMember(members,req.user);

        return {
            _id:otherUser._id,
            name:otherUser.name,
            avatar:otherUser.avatar.url,
        }
    });

    if(chatId){
          
        const chat= await Chat.findById(chatId);

        const availableFriends=friends.filter(
            (friend)=> !chat.members.includes(friend._id)
        )
            return res.status(200).json({
                success: true,
                availableFriends,
              });
        
    }
    else {
           
    return res.status(200).json({
        success: true,
        friends,
      });

    }

  } catch (error) {}
};
export {
  login,
  newUser,
  getMyProfile,
  logout,
  searchUser,
  sendFriendRequest,
  acceptFriendRequest,
  getAllnotifications,
  getMyFriends
};
