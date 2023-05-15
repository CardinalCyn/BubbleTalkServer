//express boilerplate
const express=require('express');
const app=express();
//cross origin, allows us to communicate w/ react frontend
const cors=require('cors');
app.use(cors({
    origin:[process.env.CLIENT_URL],
    methods:["GET","POST","DELETE"],
    credentials:true,
}));

app.use(function (req, res, next) {
    res.header("Access-Control-Allow-Origin", process.env.CLIENT_URL); // update to match the domain you will make the request from
    res.header(
        "Access-Control-Allow-Headers",
        "Origin, X-Requested-With, Content-Type, Accept"
    );
    res.header("Access-Control-Allow-Credentials", "true");
    next();
});

//used to turn server into https
const http=require('http').createServer(app);
//allows us to use req.body, access data sent by client
app.use(express.json());
app.use(express.urlencoded({extended:false}));
//allows us to read environment variables
require('dotenv').config()
//sql connection creation, sql functions
const dbExports=require('./db');
const db=dbExports.db;
const searchUserByInsertID=dbExports.searchUserByInsertID;
const createRoom=dbExports.createRoom;
const joinRoom=dbExports.joinRoom;
const leaveRoom=dbExports.leaveRoom;
const getRoomsJoined=dbExports.getRoomsJoined;
//express session middleware, expiration time, checks how often its expired, creates table if doesnt exist already
const session=require("express-session");
var MySQLStore = require('express-mysql-session')(session);
const store=new MySQLStore({
    expires: 14*24*60*60*1000,
    clearExpired: true,
    checkExpirationInterval:9000,
    createDatabaseTable:true,
    schema:{
        tableName:"sessions",
        columnNames:{
            session_id:"session_id",
            expires:"expires",
            data:"session_data"
        }
    }
},db);
app.use(session({
    name:process.env.SESSION_NAME,
    secret:process.env.SESSION_SECRET,
    resave:false,
    saveUninitialized:false,
    store:store,
    cookie:{
        secure:true,
        sameSite:'none',
        maxAge:14*24*60*60*1000,
    }
}))
//verification functions
const inputVerification=require('./inputValidation');
const checkValidLogin=inputVerification.checkValidLogin;
const checkValidRegistration=inputVerification.checkValidRegistration;
const checkValidProfile=inputVerification.checkValidProfile;
const checkAboutMeBioValid=inputVerification.checkAboutMeBioValid;
//update pfp in db function
const updateProfilePicture=inputVerification.updateProfilePicture;
const searchUserByUsername=inputVerification.searchUserByUsername;
//file upload
const multer= require('multer');
const upload = multer({ 
    // storage:storage,
    limits:{fileSize:2*1024*1024},
    fileFilter:(req,file,cb)=>{
        //checks if the file is a picture or not
        if(file.mimetype=="image/png"||file.mimetype=="image/jpg"||file.mimetype=="image/jpeg"){
            cb(null,true);
        }
        else{
            cb(null,false);
            return cb(new Error('Only pngs, jpgs, and .jpegs are allowed!'))
        }
    }
});
//aws for profile picture storage, upload and delete imgs
const aws=require('./aws');
const uploadToBucket=aws.uploadToBucket;
const deleteFromBucket=aws.deleteFromBucket;
//uuid for naming profile pictures
const { v4: uuidv4 } = require('uuid');
//websocket implementation for chat
const emitUpdateSocketRoom= require('./socket')(http,searchUserByUsername,dbExports.getUsersInRoom,dbExports.uploadMessage);
//routes
require('./routes')(app,checkValidLogin,checkValidRegistration,checkValidProfile,upload,updateProfilePicture,searchUserByInsertID,searchUserByUsername,createRoom,dbExports.createDirectRoom,joinRoom,leaveRoom,getRoomsJoined,dbExports.getMessagesInRoom,uploadToBucket,deleteFromBucket,uuidv4,emitUpdateSocketRoom,checkAboutMeBioValid,dbExports.updateAboutMeBio);
var port = process.env.PORT || 5000;
http.listen(port,'0.0.0.0', console.log("listening on port 5000"));
