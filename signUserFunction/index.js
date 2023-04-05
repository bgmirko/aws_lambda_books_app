import { PutItemCommand } from "@aws-sdk/client-dynamodb";
import { marshall } from "@aws-sdk/util-dynamodb";
import { ddbClient } from "./ddbClient.js";

const tableName = "user";

export const handler = async (event) => {
  try {
    const { sub, email } = event.request.userAttributes;

    const userParams = {
      TableName: tableName,
      Item: marshall({
        uuid: sub,
        email,
      }),
    };

    await ddbClient.send(new PutItemCommand(userParams));

    return event;
  } catch (e) {
    console.error(e);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: "User registration failed" }),
    };
  }
};
