import { ddbClient } from "./ddbClient.js";
import {
  PutItemCommand,
  QueryCommand,
  DeleteItemCommand,
  GetItemCommand,
  UpdateItemCommand,
} from "@aws-sdk/client-dynamodb";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";
import { v4 as uuidv4 } from "uuid";
import jwt_decode from "jwt-decode";
import { PublishCommand } from "@aws-sdk/client-sns";
import { snsClient } from "./snsClient.js";

export const handler = async (event) => {
  let body = JSON.stringify("Hello from Lambda!");

  try {
    switch (event.httpMethod) {
      case "GET":
        if (event.pathParameters && event.pathParameters.id) {
          body = await getUserBooks(event);
        }
        break;
      case "POST":
        body = await createNewBook(event);
        break;
      case "DELETE":
        body = await deleteBook(event);
        break;
      case "PATCH":
        body = await updateBook(event);
        break;
      default:
        throw new Error("Http method not supported");
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
        message: "Failed to perform operation",
        errorMsg: e.message,
        errorStack: e.errorStack,
      }),
    };
  }
};

const createNewBook = async (event) => {
  try {
    const requestBody = JSON.parse(event.body);

    const uuid = uuidv4();
    requestBody.bookUuid = uuid;

    const params = {
      TableName: "books",
      Item: marshall(requestBody || {}),
    };

    const createBook = await ddbClient.send(new PutItemCommand(params));

    await sendTopicBookCreated();
    return createBook;
  } catch (e) {
    console.error(e);
    throw e;
  }
};

const getUserBooks = async (event) => {
  try {
    const userUuid = event.pathParameters.id;

    const params = {
      TableName: "books",
      IndexName: "userUuid-index",
      KeyConditionExpression: "userUuid = :userUuid",
      ExpressionAttributeValues: { ":userUuid": { S: userUuid } },
    };

    const { Items } = await ddbClient.send(new QueryCommand(params));

    return Items.map((book) => unmarshall(book));
  } catch (e) {
    console.error(e);
    throw e;
  }
};

const deleteBook = async (event) => {
  const userToken = event.headers.Authorization.split(" ")[1];
  const decodedToken = jwt_decode(userToken);

  try {
    const isUserAuthorized = await authorActionOnOwnBook(
      event.pathParameters.id,
      decodedToken.sub
    );

    if (isUserAuthorized !== true) {
      return isUserAuthorized;
    }

    const params = {
      TableName: "books",
      Key: marshall({
        bookUuid: event.pathParameters.id,
      }),
    };

    const deleteResult = await ddbClient.send(new DeleteItemCommand(params));

    return deleteResult;
  } catch (e) {
    console.error(e);
    throw e;
  }
};

const updateBook = async (event) => {
  const userToken = event.headers.Authorization.split(" ")[1];
  const decodedToken = jwt_decode(userToken);

  try {
    const bookUuid = event.pathParameters.id;
    const isUserAuthorized = await authorActionOnOwnBook(
      bookUuid,
      decodedToken.sub
    );

    if (isUserAuthorized !== true) {
      return isUserAuthorized;
    }

    const requestBody = JSON.parse(event.body);

    const bookParams = {
      TableName: "books",
      Key: marshall({ bookUuid: bookUuid }),
      UpdateExpression: `SET ${Object.keys(requestBody)
        .map((_, index) => `#key${index} = :value${index}`)
        .join(", ")}`,
      ExpressionAttributeNames: Object.keys(requestBody).reduce(
        (acc, key, index) => ({
          ...acc,
          [`#key${index}`]: key,
        }),
        {}
      ),
      ExpressionAttributeValues: marshall(
        Object.keys(requestBody).reduce(
          (acc, key, index) => ({
            ...acc,
            [`:value${index}`]: requestBody[key],
          }),
          {}
        )
      ),
    };

    const updateBook = await ddbClient.send(new UpdateItemCommand(bookParams));

    return updateBook;
  } catch (e) {
    console.error(e);
    throw e;
  }
};

const authorActionOnOwnBook = async (bookUuid, userUuid) => {
  try {
    const bookParams = {
      TableName: "books",
      Key: marshall({
        bookUuid: bookUuid,
      }),
    };

    const bookData = await ddbClient.send(new GetItemCommand(bookParams));

    if (!bookData.Item) {
      return {
        statusCode: 404,
        body: JSON.stringify({
          message: "Book not found",
        }),
      };
    }

    const book = unmarshall(bookData.Item);

    const userParams = {
      TableName: "user",
      Key: marshall({ uuid: userUuid }),
    };

    const userData = await ddbClient.send(new GetItemCommand(userParams));

    const user = unmarshall(userData.Item);

    if (user.role === "Author" && user.uuid !== book.userUuid) {
      return {
        statusCode: 403,
        body: JSON.stringify({
          message: "You are not allowed to delete book of other author",
        }),
      };
    }

    return true;
  } catch (e) {
    console.error(e);
    throw e;
  }
};

const sendTopicBookCreated = async () => {
  const params = {
    TopicArn: `arn:aws:sns:${process.env.REGION}:${process.env.ACCOUNT_ID}:BookCreated`,
    Message: JSON.stringify({ "message": "New Book Created" }),
  };

  try {
    const data = await snsClient.send(new PublishCommand(params));
    console.log("Success", data);
  } catch (err) {
    console.log("Error", err);
  }
};
