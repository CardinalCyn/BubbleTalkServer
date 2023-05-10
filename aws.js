const { S3Client, PutObjectCommand, DeleteObjectCommand } = require("@aws-sdk/client-s3");
require('dotenv').config();

const BUCKET_NAME=process.env.BUCKET_NAME;
const BUCKET_REGION=process.env.BUCKET_REGION;
const AWS_ACCESS_KEY=process.env.AWS_ACCESS_KEY;
const AWS_SECRET_KEY=process.env.AWS_SECRET_KEY;

const s3=new S3Client({
    credentials:{
        accessKeyId:AWS_ACCESS_KEY,
        secretAccessKey:AWS_SECRET_KEY,
    },
    region:BUCKET_REGION
})

const uploadToBucket=async(profilePicFile,picName)=>{
    try{
        const input={
            Bucket:BUCKET_NAME,
            Body:profilePicFile.buffer,
            ContentType:profilePicFile.mimetype,
            Key:picName,
        }
        const command=new PutObjectCommand(input);
        const data= await s3.send(command);
        return {status:"success",data:data};
    }catch(err){
        console.error(err);
        return {status:"error",error:err};
    }
}

const deleteFromBucket=async(profilePicName)=>{
    try{
        const input={
            Bucket:BUCKET_NAME,
            Key:profilePicName
        }
        const command=new DeleteObjectCommand(input);
        const data=await s3.send(command);
        return {status:"success",data:data};
    }catch(err){
        console.error(err);
        return {status:"error",error:err};
    }
}
module.exports={uploadToBucket,deleteFromBucket}