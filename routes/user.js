import express from "express";
import { acceptFriendRequest, getAllnotifications, getMyFriends, getMyProfile, login, logout, newUser, searchUser, sendFriendRequest } from "../controllers/user.js";
import { singleAvatar } from "../middlewares/multer.js";
import { isAuthenticated } from "../middlewares/auth.js";
import { acceptRequestValidator, loginValidator, registerValidator, sendRequestValidator, validateHandle } from "../lib/validators.js";


const app=express.Router();

app.post("/new",singleAvatar,registerValidator(),validateHandle ,newUser)
app.post("/login",loginValidator(),validateHandle,login)

//after this user must be logees in 
app.use(isAuthenticated);


app.get("/me",getMyProfile);
app.get("/logout",logout)

app.get("/search",searchUser);

app.put("/sendrequest",sendRequestValidator(),validateHandle,sendFriendRequest);
app.put("/acceptrequest",acceptRequestValidator(),validateHandle,acceptFriendRequest);

app.get("/notifications",getAllnotifications);

app.get("/friends",getMyFriends);
export default app;