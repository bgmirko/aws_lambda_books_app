import {
  CognitoIdentityProviderClient,
  AdminInitiateAuthCommand,
} from "@aws-sdk/client-cognito-identity-provider";

export const handler = async (event) => {
  const cognitoIdentityServiceProvider = new CognitoIdentityProviderClient({
    region: process.env.REGION,
  });
  const { username, password } = JSON.parse(event.body);

  const params = {
    AuthFlow: process.env.AUTH_FLOW, // Amazon Cognito -> Users pools -> app integration -> app client information
    ClientId: process.env.CLIENT_ID,
    UserPoolId: process.env.USER_POOL_ID,
    AuthParameters: {
      USERNAME: username,
      PASSWORD: password,
    },
  };

  try {
    const {
      AuthenticationResult: { IdToken, AccessToken },
    } = await cognitoIdentityServiceProvider.send(
      new AdminInitiateAuthCommand(params)
    );
    return {
      statusCode: 200,
      body: JSON.stringify({
        message: "Login successful",
        AccessToken: AccessToken,
        IdToken: IdToken,
      }),
    };
  } catch (err) {
    console.log(`Error logging in user ${username}: ${err}`);
    return {
      statusCode: 401,
      body: JSON.stringify({ message: "Login failed" }),
    };
  }
};
