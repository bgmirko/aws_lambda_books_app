import {
  ScanCommand,
  PutItemCommand,
  DeleteItemCommand,
  UpdateItemCommand,
  GetItemCommand,
  QueryCommand,
} from "@aws-sdk/client-dynamodb";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";
import { ddbClient } from "./ddbClient.js";
import { v4 as uuidv4 } from "uuid";

export const handler = async function (event) {
  let body;

  try {
    switch (event.httpMethod) {
      case "GET":
        if (event.queryStringParameters != null) {
          body = await getUserByRole(event);
        } else if (event.pathParameters && event.pathParameters.id) {
          body = await getUserById(event.pathParameters.id);
        } else {
          body = await getAllUsers();
        }
        break;
      case "POST":
        body = await createUser(event);
        break;
      case "DELETE":
        body = await deleteUser(event.pathParameters.id);
        break;
      case "PATCH":
        body = await updateUser(event);
        break;
      default:
        throw new Error(`Unsupported route: "${event.httpMethod}"`);
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: `Successfully finished operation: "${event.httpMethod}"`,
        body: body,
      }),
    };
  } catch (e) {
    console.error(e);
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: "Failed to perform operation.",
        errorMsg: e.message,
        errorStack: e.stack,
      }),
    };
  }
};

const getAllUsers = async () => {
  try {
    const params = {
      TableName: "user",
    };

    const { Items } = await ddbClient.send(new ScanCommand(params));

    return Items ? Items.map((item) => unmarshall(item)) : {};
  } catch (e) {
    console.error(e);
    throw e;
  }
};

const createUser = async (event) => {
  try {
    console.log(`createUser function. event : "${event}"`);

    const userRequest = JSON.parse(event.body);

    // set userId
    const uuid = uuidv4();
    userRequest.uuid = uuid;

    const params = {
      TableName: "user",
      Item: marshall(userRequest || {}),
    };

    const createResult = await ddbClient.send(new PutItemCommand(params));

    return createResult;
  } catch (e) {
    console.error(e);
    throw e;
  }
};

const deleteUser = async (uuid) => {
  try {
    const params = {
      TableName: "user",
      Key: marshall({ uuid: uuid }),
    };

    const deleteResult = await ddbClient.send(new DeleteItemCommand(params));

    return deleteResult;
  } catch (e) {
    console.error(e);
    throw e;
  }
};

const updateUser = async (event) => {
  try {
    const requestBody = JSON.parse(event.body);
    const objKeys = Object.keys(requestBody);
    const params = {
      TableName: "user",
      Key: marshall({ uuid: event.pathParameters.id }),
      UpdateExpression: `SET ${objKeys
        .map((_, index) => `#key${index} = :value${index}`)
        .join(", ")}`,
      ExpressionAttributeNames: objKeys.reduce(
        (acc, key, index) => ({
          ...acc,
          [`#key${index}`]: key,
        }),
        {}
      ),
      ExpressionAttributeValues: marshall(
        objKeys.reduce(
          (acc, key, index) => ({
            ...acc,
            [`:value${index}`]: requestBody[key],
          }),
          {}
        )
      ),
    };
    const updateUser = await ddbClient.send(new UpdateItemCommand(params));

    return updateUser;
  } catch (e) {
    console.log(e);
    throw e;
  }
};

const getUserById = async (uuid) => {
  try {
    const params = {
      TableName: "user",
      Key: marshall({ uuid: uuid }),
    };
    const { Item } = await ddbClient.send(new GetItemCommand(params));

    return Item ? unmarshall(Item) : {};
  } catch (e) {
    console.log(e);
    throw e;
  }
};

const getUserByRole = async (event) => {
  const params = {
    TableName: "user",
    KeyConditionExpression: "#uuid = :userUuid",
    FilterExpression: "contains (#role, :role)",
    ExpressionAttributeNames: { "#uuid": "uuid", "#role": "role" },
    ExpressionAttributeValues: {
      ":userUuid": { S: event.pathParameters.id },
      ":role": { S: event.queryStringParameters.role },
    },
  };
  const { Items } = await ddbClient.send(new QueryCommand(params));

  return Items.map((item) => unmarshall(item));
};
