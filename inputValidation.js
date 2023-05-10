const bcrypt=require("bcrypt");
const validator=require('email-validator');
const dbExports=require('./db');
const updateProfilePicture=dbExports.updateProfilePicture
const searchUserByInsertID=dbExports.searchUserByInsertID;
const searchUserByUsername=dbExports.searchUserByUsername;
const searchUserByUsernameAndEmail=dbExports.searchUserByUsernameAndEmail;
const createUser=dbExports.createUser;

//checks db if credentials are valid or not
const checkValidLogin=async(username,password)=>{
    try{
        const user=await searchUserByUsername(username);
        if(!user.length){
            return "credentialsInvalid";
        }
        else{
            const dbHashedPassword=user[0].userPassword;
            if(await bcrypt.compare(password,dbHashedPassword)){
                return user[0];
            }
            else{
                return "credentialsInvalid";
            }
        }
    }catch(err){
        return "internalError"
    }
}
//checks if inputs are valid for registration such as length, valid email, password, etc
const checkValidRegistration=async(email,username,password)=>{
    try{
        const defaultAboutMeBio="Welcome to "+username+"'s profile. If this is your profile, you can edit it by clicking the edit button to display more about you.";

        const hashedPassword=await bcrypt.hash(password,10);

        const maxEmailLength=40;
        const minUsernameLength=2;
        const maxUsernameLength=20;
        const minPasswordLength=6;
        const maxPasswordLength=60;
        const defaultPFPLink="default"
        const invalidInput={};
        if(!validator.validate(email)||email.length>maxEmailLength){
            invalidInput.emailInvalid=true;
        }
        const regExp=/^[a-z0-9]+$/i;
        if(username.length>maxUsernameLength||username.length<minUsernameLength||regExp.test(username)===false){
            invalidInput.usernameInvalid=true;
        }
        if(password.length<minPasswordLength||password.length>maxPasswordLength){
            invalidInput.passwordInvalid=true;
        }
        if(Object.keys(invalidInput).length){
            return {status:"invalidInput",invalidFields:invalidInput};
        }
        try{
            const user=await searchUserByUsernameAndEmail(username,email);
            if(user.length){
                return {status:"userExists"};
            }
            else{
                try{
                    const createdUser=await createUser(email,username,hashedPassword,defaultPFPLink,defaultAboutMeBio);
                    const { insertId } = createdUser;
                    const user=await searchUserByInsertID(insertId);
                    if(user[0]){
                        return {status:"registerSuccess",user:user[0]}; 
                    }
                }catch(err){
                    console.error(err);
                    return {status:"internalError"};
                }
            }
        }catch(err){
            console.error(err);
            return {status:"internalError"};
        }
    }catch(err){
        console.error(err);
        return {status:"internalError"}
    }
}
//checks if the profile page is of a valid user
const checkValidProfile=async(username)=>{
    try{
        const user=await searchUserByUsername(username);
        const userFound=user.length?true:false;
        return userFound;
    }catch(err){
        console.error(err);
        return "internalServerError"
    }
    
}
//checks if roomLink is structurally valid
const checkValidRoomLink=async(roomLink)=>{
    const regExp=/^[a-z]+$/i;
    if(regExp.test(roomLink)&&roomLink.length===8){
        return true;
    }
    return false;
}
//checks if aboutMeBio is valid
const checkAboutMeBioValid=async(aboutMeBio)=>{
    const regExp = /^[a-zA-Z0-9\s\p{P}!@#$%^&*()-=_+.,<>?/;:'"|]*$/;
    if(regExp.test(aboutMeBio)&&aboutMeBio.length<=512){
        return true;
    }
    return false;
}
module.exports={checkValidLogin,checkValidRegistration,checkValidProfile,updateProfilePicture,searchUserByUsername,checkValidRoomLink,checkAboutMeBioValid}


