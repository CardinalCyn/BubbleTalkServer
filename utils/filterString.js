const filterRoomName=(roomName, str1)=>{
    return roomName.replace(new RegExp(`^${str1}/|/${str1}$`, "g"), "");
} 
module.exports={filterRoomName}