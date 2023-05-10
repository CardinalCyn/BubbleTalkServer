module.exports=(app,checkValidLogin,checkValidRegistration,checkValidProfile,upload,updateProfilePicture,searchUserByInsertID,searchUserByUsername,createRoom,createDirectRoom,joinRoom,leaveRoom,getRoomsJoined,getMessagesInRoom,uploadToBucket,deleteFromBucket,uuidv4,emitUpdateSocketRoom,checkAboutMeBioValid,updateAboutMeBio)=>{
    //login request, takes in username, password, and remember me in body. checks if username/password are valid, otherwise makes cookie and sends data to client
    app.post("/login",async(req,res)=>{
        try{
            let {username,password,staySignedIn}=req.body;
            //no username or password in request
            if(!username||!password){
                res.json({status:"credentialsInvalid"});
            }else{
                try{
                    //checks if the inputs are valid
                    const user=await checkValidLogin(username,password);
                    if(user==="credentialsInvalid"){
                        res.json({status:user});
                    }else if(user==="internalError"){
                        res.json({status:"internalError"});
                    }
                    else{
                        //if staysignedin is unchecked, itll expire in 2 hours
                        if(!staySignedIn){
                            req.session.cookie.expires=new Date(Date.now()+2*60*60*1000)
                        }
                        //saves the user data to the session cookie
                        req.session.user=user;
                        req.session.save();
                        res.json({status:"userValid",username:username});
                    }
                }catch(err){
                    console.error(err);
                    res.json({status:"internalError"});
                }
            }
        }
        catch (err){
            console.error(err);
            res.json({status:"internalError"});
        }
    })
    //checks if username, password are valid len/ characters, then sends status to client
    app.post("/register",async(req,res)=>{
        try{
            const {email,username,password,staySignedIn}=req.body;
            const userStatus=await checkValidRegistration(email,username,password);
            //if successful,save userdata to cookie
            if(userStatus["status"]==="registerSuccess"){
                if(!staySignedIn){
                    req.session.cookie.expires=new Date(Date.now()+2*60*60*1000)
                }
                req.session.user=userStatus["user"];
                req.session.save();
            }
            //sends username if registration successful
            const statusToSend={status:userStatus["status"]}
            if(userStatus["user"]) statusToSend["username"]=userStatus["user"]["userUsername"];
            res.send(statusToSend);
        }catch(err){
            console.error(err);
            res.json({status:"internalError"})
        }
    })
    //checks if there is req session, and sends status
    app.get("/checkSession",async(req,res)=>{
        if(req.session.user){
            res.json({status:"success",loggedIn:true,username:req.session.user.userUsername});
        }
        else{
            res.json({status:"success",loggedIn:false,username:""});
        }
    })
    //checks if the profile page belongs to a user or not
    app.post("/checkValidProfile",async(req,res)=>{
        try{
            const username=req.body.username;
            const profileStatus=await checkValidProfile(username);
            res.send(profileStatus);
        }catch(err){
            console.error(err);
            return "internalServerError";
        }
    })
    //handles profile pictures being uploaded, sends to aws s3 bucket
    //if its not an image, or above img size, itll send an error. multer code in server.js handles this
    app.post("/profilePictureUpload",upload.single("profilePicture"),async(req,res,next)=>{
        const profileUsername=req.body.profileNameOfProfilePage;
        //if user isnt logged in,sends not loggedin to client
        if(!req.session||!req.session.user){
            res.json({status:"notLoggedIn"});
        }
        //no file, returns response
        else if(!req.file){
            res.json({status:"fileNotSent"});
        }
        //someone trying to update someone elses pfp
        else if(profileUsername!==req.session.user.userUsername){
            res.json({status:"invalidPictureUploadAttempt"});
        }
        else{
            try{
                //uuid for pfp name
                const profilePictureName=uuidv4();
                const user=await searchUserByUsername(req.session.user.userUsername);
                const previousPFP=user[0]["userProfilePic"];
                //updates pfp name in the db
                const updatePFPStatus=await updateProfilePicture(profileUsername,profilePictureName);
                if(updatePFPStatus["serverStatus"]===34){
                    //uploads the img to aws
                    const awsUploadReq=await uploadToBucket(req.file,profilePictureName);
                    if(awsUploadReq["status"]==="success"&&awsUploadReq["data"]["$metadata"]["httpStatusCode"]===200){
                        if(previousPFP!=="default"){
                            //deletes olf pfp if it isnt the default one
                            const awsDeleteReq=await deleteFromBucket(previousPFP);
                            if(awsDeleteReq["status"]==="success"){
                                //sends link to client so it can be instantly updated
                                res.json({status:"success",img:process.env.AWS_IMG_LINK+profilePictureName});
                            }
                        }
                    }
                }
            }catch(err){
                console.error(err);
                res.json({status:"fileNotSent"});
            }
        }
    })
    //gets users pfp from db
    app.get("/profilePicture",async(req,res)=>{
        try{
            //finds username in db, sends back their pfp
            const userProfile=await searchUserByUsername(req.query.username);
            const profilePictureName=userProfile[0].userProfilePic;
            res.json({status:"success",img:process.env.AWS_IMG_LINK+profilePictureName})
        }
        catch(err){
            console.error(err);
            res.json({status:"internalServerError"})
        }
    })
    //gets the aboutMeBio from user
    app.get("/aboutMeBio",async(req,res)=>{
        try{
            //finds username in db, sends back success and the aboutmebio text
            const userProfile=await searchUserByUsername(req.query.username);
            const aboutMeBio=userProfile[0].aboutMeBio;
            res.json({status:"success",aboutMeBio:aboutMeBio});
        }catch(err){
            console.error(err);
            res.json({status:"internalServerError"});
        }
    })
    //posts aboutMeBio for user
    app.post("/aboutMeBioUpload",async(req,res)=>{
        try{
            if(!req.session||!req.session.user||!req.session.user.userUsername){
                res.json({status:"notLoggedIn"})
            }
            else{
                const {username,aboutMeBio}=req.body;
                if(username!==req.session.user.userUsername){
                    res.json({status:"notSameUser"});
                }else{
                    const checkAboutMeBioValidRequest=await checkAboutMeBioValid(aboutMeBio)
                    if(checkAboutMeBioValidRequest){
                        await(updateAboutMeBio(username,aboutMeBio));
                        res.json({status:"success",aboutMeBio:aboutMeBio});
                    }else{
                        res.json({status:"aboutMeBioInputInvalid"});
                    }
                }
            }
        }catch(err){
            console.error(err);
            res.json({status:"internalServerError"});
        }
    })
    //creates group room
    app.post("/createRoom",async(req,res)=>{
        try{
            if(!req.session||!req.session.user||!req.session.user.userUsername){
                res.json({status:"notLoggedIn"})
            }else{
                const {roomName,roomType}=req.body;
                const userUsername=req.session.user.userUsername;
                const statusRoomCreation=await createRoom(userUsername,roomName,roomType);
                res.json({status:"success",roomLink:statusRoomCreation.roomLink,roomName:roomName});
            }
            
        }catch(err){
            console.error(err);
            res.json({status:"roomCreationFailed"});
        }
    })
    //creates dm room
    app.post('/createDirectMessageRoom',async(req,res)=>{
        try{
            if(!req.session||!req.session.user||!req.session.user.userUsername){
                res.json({status:"notLoggedIn"})
            }else{
                const {userToDM}=req.body;
                const userUsername=req.session.user.userUsername;
                const statusDMCreation=await createDirectRoom(userUsername,userToDM);
                if(statusDMCreation["roomLink"]){
                    emitUpdateSocketRoom({username:userToDM});
                }
                res.send(statusDMCreation);
            }
        }catch(err){
            console.error(err);
            res.json({status:"createDMRoomFail"});
        }
    })
    //user joins room, db call. if the room was a dm, and person not associated w/ the dm joins, the dm is converted into a room
    app.post("/joinRoom",async(req,res)=>{
        try{
            const userUsername=req.session.user.userUsername;
            const roomLink=req.body.roomLink;
            const joinRoomReq=await joinRoom(userUsername,roomLink);
            if(joinRoomReq["convertedToGroup"]) emitUpdateSocketRoom({roomLink:roomLink});
            res.json(joinRoomReq);
        }catch(err){
            res.json({status:"joinRoomFail"});
        }
    })
    //user leaves room
    app.post("/leaveRoom",async(req,res)=>{
        try{
            if(!req.session.user||!req.session.user.userUsername){
                res.json({status:"notLoggedIn"});
            }else{
                const username=req.session.user.userUsername;
                const roomLink=req.body.roomLink;
                const leaveRoomStatus=await leaveRoom(username,roomLink);
                if(leaveRoomStatus==="userLeft"){
                    res.json({status:"success"});
                }else{
                    res.json({status:"userLeftFailed"});
                }
            }
            
        }catch(err){
            console.error(err);
            res.json({status:"userLeftFailed"});
        }
    })
    //gets rooms associated w/ a user
    app.get("/getUserRooms",async(req,res)=>{
        try{
            if(!req.session.user||!req.session.user.userUsername){
                res.json({status:"notLoggedIn"});
            }else{
                const userUsername=req.session.user.userUsername;
                const roomsJoined=await getRoomsJoined(userUsername);
                res.json({status:"success",userRooms:roomsJoined});
            }    
        }catch(err){
            console.error(err);
            res.json({status:"getUserRoomsFailed"})
        }
    })
    //gets messages based on offset. the higher the offset, the earlier the messages retrieved
    app.get('/getMessages/:roomLink/:offset?/',async(req,res)=>{
        try{
            const {roomLink,offset}=req.params;
            const messagesResult=await getMessagesInRoom(roomLink,Number(offset));
            let messagesArray=[];
            let userIdsRetrieved={};
            for(const message of messagesResult){
                if(!userIdsRetrieved.hasOwnProperty(message["userID"])){
                    const userData=await searchUserByInsertID(message["userID"]);
                    const userUsername=userData[0]["userUsername"];
                    const userProfilePicPath=userData[0]["userProfilePic"];
                    const userProfilePicLink=process.env.AWS_IMG_LINK+userProfilePicPath;
                    userIdsRetrieved[message["userID"]]=[userUsername,userProfilePicLink];
                    messagesArray.unshift([userUsername,userProfilePicLink,message["messageText"]])
                }else{
                    const userUsername=userIdsRetrieved[message["userID"]][0]
                    const userProfilePic=userIdsRetrieved[message["userID"]][1];
                    messagesArray.unshift([userUsername,userProfilePic,message["messageText"]])
                }
            }
            res.json({status:"success",messages:JSON.stringify(messagesArray)});
        }catch(err){
            console.error(err);
            res.json({status:"failureGettingMessages"})
        }
    })
    //logs out, destroys the session
    app.get("/logout",async(req,res)=>{
        req.session.destroy((err)=>{
            if(err) throw err;
            res.clearCookie("chat_app_session");
            res.send("sessionDestroyed");
        })
    })
}