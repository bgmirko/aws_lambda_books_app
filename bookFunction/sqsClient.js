import { SQSClient } from "@aws-sdk/client-sqs";
const REGION = "us-east-2";
const sqsClient = new SQSClient({ region: process.env.REGION });
export { sqsClient };