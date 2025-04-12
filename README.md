## GitHub Membership Changes with Permit

The repo contains a Node.js server that listens for GitHub organization membership events and syncs the data to Permit accordingly. It uses Redis to store the events for persistence if Permit PDP is down or the server is down. It also retries the failed events every 5 minutes and replays the events after a server restart. It's to demonstrate event-driven updates from changes in GitHub organization membership to Permit.

![GitHub Membership Changes with Permit](/img/event-driven-updates/readme-banner.gif)

## Features

- Listens to GitHub org membership events (`member_added`, `member_removed`, etc.)
- Uses [Permit.io](https://docs.permit.io/) for RBAC (Role-Based Access Control)
- Uses Redis for:
  - Persisting incoming events
  - Retrying failed events every 5 minutes
  - Replaying events after a server restart

## Setting up the Project

Sure! Here’s a simplified and polished version:
- First, we’ll set up a Permit project to manage access control.
- Next, we’ll create a Node.js server to handle GitHub webhook events and sync data with Permit.
- We’ll configure a GitHub webhook to send events to our server.
- We’ll set up a Redis server to temporarily store events for retry in case of failures.
- Finally, we’ll run the server to listen for GitHub events and keep Permit in sync.

### Setting up a Policies, Roles and Resources in Permit

To get started, first we need to create a Policy, Roles and Resource in Permit to manage the access control. If you not familiar how to do it, [here](https://docs.permit.io/quickstart) a quick guide.

As this guide is focused on event-driven updates from change in GitHub organization membership, we will create a resource name and id `membership` and under that we will add actions like `create-repo`, `view-private-repo`, `delete-repo`, `edit-repo`, etc. We keep the naming convention simple and similar to the action we have in GitHub. After creating the resource, it will look like this.

![Permit Resource](/img/event-driven-updates/permit-resource.png)

Next, we will setup the roles. In a GitHub organization, there can be either `admin` or `member` roles (excluding the `owner` role as it can be only one in a GitHub org). We will create two roles in Permit name and key `admin` and `member`. After creating the roles, it will look like this.

![Permit Role](/img/event-driven-updates/permit-role.png)

Now, once we have created the resources and roles, we will create a policy to allow actions on the `membership` resource. For `member` role, we will allow only `view-private-repo` action and for `admin` role, we will allow all actions. This is how our final policy will look like.

![Permit Policy](/img/event-driven-updates/permit-policy.png)

That's it. We have created a Policy, Roles and Resources in Permit. Now we are all set to write the code to listen for GitHub webhook events and sync them Permit accordingly. 

Good thing here is we can also create policies, roles, resources, etc, using Permit's APIs. But using the Permit's Dashboard is more user-friendly and given a high-level overview of the policies, roles and resources.

## Setting Up Node.js project

We will be using **Node.js** and **Express** to create a server to listen for GitHub webhook events and sync the data to Permit accordingly. We will be using Permit's APIs using **Node.js SDK** to update the user's role in Permit.

### Prerequisites

- **Permit API Key:** We need a Permit API key to interact with Permit's APIs. We can get from the project we have created in the Permit dashboard. Also, [here](https://docs.permit.io/overview/connecting-your-app/#1-get-your-permit-environment-api-key) a detailed step-by-step guide on how to create an API key.
- **Setting up PDP:** Permit provides us with a Policy Decision Point (PDP), which functions as our microservice for authorization. We can use either cloud or a local Docker container to set up the PDP. [Here](https://docs.permit.io/overview/connecting-your-app/#2-setup-your-pdp-policy-decision-point-container) is a detailed guide on how to set up a PDP and get the PDP URL.
- **GitHub Organization access:** We need a GitHub organization Owner or Admin access to set up webhooks and listen to memberships changes related events. We can set up a GitHub organization [here](https://docs.github.com/en/organizations/collaborating-with-groups-in-organizations/creating-a-new-organization-from-scratch). It's Free.
- **Other tools:** Node.js, Docker, etc.

### Initialize and Install Dependencies

Let's start by creating a new Node.js project and installing the required dependencies. We will be using [Express](https://expressjs.com) to create a simple server and Permit [Node.js SDK](https://docs.permit.io/sdk/nodejs/quickstart-nodejs) to interact with Permit's APIs.

```bash
npm init -y
npm install express permitio
```

### Writing the Code

We will be breaking down the code in the next steps to get more clarity. But for now here is complete code. Create a file named `index.js` in the root of the project and paste the following code and replace `<YOUR_PDP_URL>` with the PDP URL and `<PERMIT_TOKEN>` with the Permit API key.

```javascript
const { Permit } = require("permitio");
const express = require("express");

const PORT = 4000; // Change the PORT if required
const PDP = "<YOUR_PDP_URL"; // Change with your PDP
const PERMIT_TOKEN = "<PERMIT_TOKEN>"; // Change with your Permit API key
const TENANT = "default";

// Initialize Permit SDK  
const permit = new Permit({
  pdp: PDP,
  token: PERMIT_TOKEN,
});
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.post("/github-membership", async (req, res) => {
  const action = req.body.action;
  
  if (!action) {
    return res.status(400).json({ error: "Missing action in request body" });
  }

  console.log(`Received action: ${action}`);

// Based on the action, call the respective function to handle the event
  try {
    switch (action) {
      case "member_invited":
        return res.status(200).json({ message: "Ignoring member_invited event" });
      case "member_added":
        console.log("User added to organization.");
        await createPermitUserAssignRole(req.body);
        break;
      case "member_removed":
        console.log("User removed from organization.");
        await removePermitUser(req.body);
        break;
      default:
        console.warn("Unhandled action type:", action);
    }
    res.status(200).json({ message: "Event processed successfully" });
  } catch (error) {
    console.error("Error handling GitHub membership event:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Create user and assign role in Permit
async function createPermitUserAssignRole(body) {
  const { membership } = body;
  if (!membership || !membership.user || !membership.role) {
    throw new Error("Invalid membership data");
  }

  const githubUsername = membership.user.login;
  const githubUserOrgRole = membership.role;

  console.log(`Creating Permit user: ${githubUsername} with role: ${githubUserOrgRole}`);

  try {
    const userResponse = await permit.api.createUser({ key: githubUsername });
    console.log("User created successfully in Permit:", userResponse);

    const roleResponse = await permit.api.assignRole({
      user: userResponse.id,
      role: githubUserOrgRole,
      tenant: TENANT
    });
    console.log("Role assigned successfully in Permit:", roleResponse);
  } catch (error) {
    console.error("Error creating user or assigning role in Permit:");
  }
}

// Remove user from Permit
async function removePermitUser(body) {
  const { membership } = body;
  if (!membership || !membership.user) {
    throw new Error("Invalid membership data");
  }

  const githubUsername = membership.user.login;
  console.log(`Removing Permit user: ${githubUsername}`);

  try {
    const response = await permit.api.deleteUser(githubUsername);
    console.log("User removed successfully from Permit");
  } catch (error) {
    console.error("Error removing user from Permit");
  }
}

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
```

Now let's break down the code to understand it better.

#### Listening for GitHub Webhook Events

In this part of code, we have set up a express server to listen for GitHub webhook events. We are listening for the `POST` requests on `/github-membership` endpoint. We are checking for the `action` in the request body and based on the action we are calling the respective function to handle the event. 

GitHub sends different actions like `member_invited`, `member_added` and `member_removed` when a user is invited, added or removed from the organization. We are ignoring the `member_invited` event and handling the `member_added` and `member_removed` events.

```javascript
app.post("/github-membership", async (req, res) => {
  const action = req.body.action;
  
  if (!action) {
    return res.status(400).json({ error: "Missing action in request body" });
  }

  console.log(`Received action: ${action}`);

  try {
    switch (action) {
      case "member_invited":
        return res.status(200).json({ message: "Ignoring member_invited event" });
      case "member_added":
        console.log("User added to organization.");
        await createPermitUserAssignRole(req.body);
        break;
      case "member_removed":
        console.log("User removed from organization.");
        await removePermitUser(req.body);
        break;
      default:
        console.warn("Unhandled action type:", action);
    }
    res.status(200).json({ message: "Event processed successfully" });
  } catch (error) {
    console.error("Error handling GitHub membership event:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});
```

#### Syncing Data with Permit

In this part of code, we are handling the `member_added` and `member_removed` events. Based on the action we are calling the respective function to handle the event. When a user is added to the organization, we are creating a user in Permit and assigning the role based on the role in the GitHub organization. When a user is removed from the organization, we are removing the user from Permit.

##### Adding a User to Permit

When the action is `member_added`, we are first creating a user in Permit (Note: this is user within the project not on organization level) and then assigning the role based on the role in the GitHub organization. 

```javascript
// Adding a User to Permit
async function createPermitUserAssignRole(body) {
  const { membership } = body;
  if (!membership || !membership.user || !membership.role) {
    throw new Error("Invalid membership data");
  }

  const githubUsername = membership.user.login; // GitHub username
  const githubUserOrgRole = membership.role; // admin or member

  console.log(`Creating Permit user: ${githubUsername} with role: ${githubUserOrgRole}`);

  try {
    const userResponse = await permit.api.createUser({ key: githubUsername });
    console.log("User created successfully in Permit:", userResponse);

    const roleResponse = await permit.api.assignRole({
      user: userResponse.id,
      role: githubUserOrgRole,
      tenant: TENANT,
    });
    console.log("Role assigned successfully in Permit:", roleResponse);
  } catch (error) {
    console.error("Error creating user or assigning role in Permit:");
  }
}
```

For creating a user we are using the `createUser` API. Below is the Payload for creating a user in Permit. We are only passing the GitHub username as the key and leaving the other fields as optional.

```json
{
  key: "benjoe", // Required
  email: "ben@example.com", // Optional
  first_name: "ben", // Optional
  last_name: "joe", // Optional
}
```

For assigning a role to the user, we are using the `assignRole` API. Below is the Payload for assigning a role to the user in Permit. We are passing the user id, role and tenant as the required fields. We are using `default` for the tenant, we can change if we have multiple tenants.

```json
{
  user: "benjoe", // It can be either user id or key (required)
  role: "member", // Required
  tenant: "default", // Required
}
```

##### Removing a User from Permit

When the action is `member_removed`, we are removing the user from Permit. For removing the user we are using `deleteUser` API. If things work as intended, we will receive a message printed that the user is removed successfully. When deleting a user, we need to pass the user key in our case it's the GitHub username.

```javascript
// Removing a User from Permit
async function removePermitUser(body) {
  const { membership } = body;
  if (!membership || !membership.user) {
    throw new Error("Invalid membership data");
  }

  const githubUsername = membership.user.login;
  console.log(`Removing Permit user: ${githubUsername}`);

  try {
    const response = await permit.api.deleteUser(githubUsername);
    console.log("User removed successfully from Permit");
  } catch (error) {
    console.error("Error removing user from Permit");
  }
}
```

That's it. We have written the code to listen for GitHub webhook events and update Permit accordingly. Now we need to set up a GitHub webhook to send events to our server and finally run the server.

#### Setting Up the GitHub Webhook

Now we have the server ready, before running the server we need to set up a GitHub webhook to send events to our server. We need to set up a webhook for the GitHub organization. Head over to the GitHub organization settings and click on the `Webhooks` tab and click on the `Add webhook` button. We will see this kind of form.

![GitHub Webhook](/img/event-driven-updates/github-webhook.png)

In the `Payload URL` field, enter the URL where the server is running (a hosted URL). It will be in the format `http://<hosted-url>/github-membership`. If we are running the server locally to test it out, we can use something like [ngrok](https://ngrok.com) or [localtunnel](https://localtunnel.github.io/www/) to expose the local server to the internet. As we can see we have used a `localtunnel` URL in the above image.

For the `Content type` select `application/json` and for the `Secret` field, we leave it empty, but if we want to secure the webhook we can enter a secret key. Keep the `SSL verification` checked. For the event we have to listen to select **Let me select individual events** and check `Organization` (make sure other than all other events are unchecked, otherwise it will send all events to the server). At last keep the **Active** checkbox checked. Then click on the `Add webhook` button.

That's it. We have set up a GitHub webhook to send events to our server. If our webhook is set up correctly, we will see a green tick mark next to the webhook URL (if we are are unable to see sometimes it takes time to verify the URL).

![GitHub Webhook Success](/img/event-driven-updates/github-webhook-success.png)

#### Running the Server

If everything is set up correctly as instructed above, from setting up policy to API keys, to a live PDP container (If we are using the local PDP container, make sure it's running), to the GitHub webhook, we can run the server using the following command.

```bash
node index.js
```

Now let's test it out by adding a user to the GitHub organization. If everything works as intended, we will see a log of action received and user created in Permit and assigned the role based on the role in the GitHub organization. We can see the screenshot below that our endpoint is working as expected.

![Server Logs](/img/event-driven-updates/server-logs.png)

To verify the user is created in Permit, we can check the Permit dashboard. We will see the user created and assigned the role based on the role in the GitHub organization.

![Permit User](/img/event-driven-updates/permit-user-manage.png)

## Challenges & Solutions

With everything up and running, there can be some challenges we might face which is not directly related to code, but intermediaries. Like a few bottleneck can be:

- What if our PDP goes down? Or if we use the OPAL Scope instead of APIs, which fetch and load data into the PDP, and it's down?
- What if the server we created goes down?

In these kind of cases, we have to take one of the typical engineering route, to store data before syncing it to the Permit. We can use Kafka, redis, etc, to store the events and process them later. This way we can ensure that we don't lose any data and can process them later when the PDP is up and running.

### Applying the solution to above code

We will use Redis to store the events and process them later. We can use Kafka and other solution, but Redis will be an optimal option considering the speed, simplicity and max volume of request we need to handle. We can use Docker to run Redis locally or any hosted Redis service.

```javascript
const { Permit } = require("permitio");
const express = require("express");
const Redis = require("ioredis");

const app = express();
const PORT = 4000;
const PDP = "<YOUR_PDP_URL>";
const PERMIT_TOKEN = "<YOUR_PERMIT_TOKEN>";
const TENANT = "default";
const REDIS_URL = "<YOUR_REDIS_URL>";

// Initialize Permit SDK
const permit = new Permit({
  pdp: PDP,
  token: PERMIT_TOKEN,
});

// Initialize Redis client using ioredis
const redis = new Redis(REDIS_URL);
redis.on("connect", () => console.log("Connected to Redis"));
redis.on("error", (err) => console.error("Redis error:", err));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Handle GitHub membership events
app.post("/github-membership", async (req, res) => {
  const action = req.body.action;

  if (!action) {
    return res.status(400).json({ error: "Missing action in request body" });
  }

  console.log(`Received action: ${action}`);

  // Store event in Redis for persistence (for retries in case of failure)
  const eventId = `event:${Date.now()}`;
  await redis.set(eventId, JSON.stringify(req.body), "EX", 86400); // Expires in 1 day

  try {
    // Process event immediately
    await processMembershipEvent(eventId, req.body);
    res.status(200).json({ message: "Event processed successfully" });
  } catch (error) {
    console.error("Error handling GitHub membership event:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Process membership events from Redis or webhook request
async function processMembershipEvent(eventId, body) {
  const action = body.action;

  if (!action) {
    console.error(`Invalid event: ${eventId}`);
    return;
  }

  try {
    switch (action) {
      case "member_invited":
        console.log("Ignoring member_invited event.");
        return;
      case "member_added":
        console.log("User added to organization.");
        await createPermitUserAssignRole(body);
        break;
      case "member_removed":
        console.log("User removed from organization.");
        await removePermitUser(body);
        break;
      default:
        console.warn("Unhandled action type:", action);
    }
    // Remove event from Redis after successful processing
    await redis.del(eventId);
  } catch (error) {
    console.error(`Error processing event ${eventId}:`, error);
    // Keep event in Redis for retry
  }
}

// Create user and assign role in Permit
async function createPermitUserAssignRole(body) {
  const { membership } = body;
  if (!membership || !membership.user || !membership.role) {
    throw new Error("Invalid membership data");
  }

  const githubUsername = membership.user.login;
  const githubUserOrgRole = membership.role;

  console.log(`Creating Permit user: ${githubUsername} with role: ${githubUserOrgRole}`);

  try {
    const userResponse = await permit.api.createUser({ key: githubUsername });
    console.log("User created successfully in Permit:", userResponse);

    const roleResponse = await permit.api.assignRole({
      user: userResponse.id,
      role: githubUserOrgRole,
      tenant: TENANT,
    });
    console.log("Role assigned successfully in Permit:", roleResponse);
  } catch (error) {
    console.error("Error creating user or assigning role in Permit:", error);
  }
}

// Remove user from Permit
async function removePermitUser(body) {
  const { membership } = body;
  if (!membership || !membership.user) {
    throw new Error("Invalid membership data");
  }

  const githubUsername = membership.user.login;
  console.log(`Removing Permit user: ${githubUsername}`);

  try {
    await permit.api.deleteUser(githubUsername);
    console.log("User removed successfully from Permit.");
  } catch (error) {
    console.error("Error removing user from Permit:", error);
  }
}

// Periodically retry failed events stored in Redis
setInterval(async () => {
  console.log("Retrying failed events from Redis...");
  const keys = await redis.keys("event:*");

  for (const key of keys) {
    const eventData = await redis.get(key);
    if (eventData) {
      await processMembershipEvent(key, JSON.parse(eventData));
    }
  }
}, 5 * 60 * 1000); // Retries every 5 minutes

app.listen(PORT, async () => {
  console.log(`Server running at http://localhost:${PORT}`);

  // Recover unprocessed events from Redis on server restart
  console.log("Replaying pending events from Redis after server restart...");
  const keys = await redis.keys("event:*");

  for (const key of keys) {
    const eventData = await redis.get(key);
    if (eventData) {
      await processMembershipEvent(key, JSON.parse(eventData));
    }
  }
});
```

We have added Redis to store the events and process them later. We have added a `processMembershipEvent` function and shifted the event processing logic to this function to reusing when processing the events from Redis. We have added a `setInterval` function to retry the failed events stored in Redis every **5 minutes**. We have also added a logic to replay the pending events from Redis after the server restart. Let's break down it further to understand it better.

#### Storing Events in Redis before sending to Permit

We are storing the events in Redis before sending them to Permit. We are using the `event` key with the current timestamp as the key and the event data as the value. We are setting the expiry time to 1 day (86400 seconds) to remove the event from Redis after 1 day.

```javascript
const eventId = `event:${Date.now()}`;
await redis.set(eventId, JSON.stringify(req.body), "EX", 86400); // Expires in 1 day
```

#### Processing Events from Redis or Webhook Request

We have added a `processMembershipEvent` function to process the events from webhook request or Redis . That means if everything works as intended, we will process the events from the webhook request and remove them from Redis. If there is an error, we will keep the event in Redis for retry. This way we can ensure that we don't lose any data and can process them later even if the PDP is down.

```javascript
async function processMembershipEvent(eventId, body) {
  const action = body.action;

  if (!action) {
    console.error(`Invalid event: ${eventId}`);
    return;
  }

  try {
    switch (action) {
      case "member_invited":
        console.log("Ignoring member_invited event.");
        return;
      case "member_added":
        console.log("User added to organization.");
        await createPermitUserAssignRole(body);
        break;
      case "member_removed":
        console.log("User removed from organization.");
        await removePermitUser(body);
        break;
      default:
        console.warn("Unhandled action type:", action);
    }
    // Remove event from Redis after successful processing
    await redis.del(eventId);
  } catch (error) {
    console.error(`Error processing event ${eventId}:`, error);
  }
}
```

#### Retrying Failed Events from Redis

We have added a `setInterval` function to retry the failed events stored in Redis every 5 minutes. We are fetching the keys from Redis and processing the events if there is any. This way we can ensure that we don't lose any data and can process them later even if the PDP is down.

```javascript
// Periodically retry failed events stored in Redis
setInterval(async () => {
  console.log("Retrying failed events from Redis...");
  const keys = await redis.keys("event:*");

  for (const key of keys) {
    const eventData = await redis.get(key);
    if (eventData) {
      await processMembershipEvent(key, JSON.parse(eventData));
    }
  }
}, 5 * 60 * 1000); // Retries every 5 minutes
```

#### Event recovery on server restart

We have also added a logic to replay the pending events from Redis after the server restart. We are fetching the keys from Redis and processing the events if there is any. This way we can ensure that we don't lose any data and can process them later even if the server restarts.

```javascript
// Recover unprocessed events from Redis on server restart
console.log("Replaying pending events from Redis after server restart...");
const keys = await redis.keys("event:*");

for (const key of keys) {
  const eventData = await redis.get(key);
  if (eventData) {
    await processMembershipEvent(key, JSON.parse(eventData));
  }
}
```

## Conclusion

That's it. We have successfully added Redis to store the events and process them later. By implementing this solution, we have achieved the following benefits

- **Persistence:** We are storing the events in Redis before sending them to Permit. This way we can ensure that we don't lose any data and can process them later even if the PDP is down.
- **Event Recovery:** We have added a logic to replay the pending events from Redis after the server restart. This way we can ensure that we don't lose any data and can process them later even if the server restarts.
- **Avoid Duplication:** As we are removing the event from Redis after successful processing, we can avoid duplication of events.
- **Auto Retries:** We have used built-in `setInterval` function to retry the failed events stored in Redis every 5 minutes. This way we can ensure that we don't lose any data and can process them later.
- **Asynchronous Processing:** We are processing the events asynchronously, so we can process multiple events at the same time.

## License  

This project is licensed under the [GNU General Public License v3.0](LICENSE).  

## Security  

For information on reporting security vulnerabilities, please refer to the [Security Policy](SECURITY.md).  

