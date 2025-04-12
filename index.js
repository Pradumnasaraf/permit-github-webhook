const { Permit } = require("permitio");
const express = require("express");
// Load environment variables from .env file
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 4000;
const PDP_URL = process.env.PDP_URL;
const PERMIT_TOKEN = process.env.PERMIT_TOKEN;

// Validate that required environment variables are set
if (!PERMIT_TOKEN) {
  console.error("PERMIT_TOKEN environment variables must be set.");
  process.exit(1);
}

const permit = new Permit({
  pdp: PDP_URL,
  token: PERMIT_TOKEN,
});

// Middleware to parse JSON and URL-encoded bodies
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Handle GitHub organization membership webhook events
app.post("/github-membership", async (req, res) => {
  const action = req.body.action;

  if (!action) {
    return res.status(400).json({ error: "Missing action in request body" });
  }

  console.log(`Received action: ${action}`);

  try {
    switch (action) {
      case "member_invited":
        // Ignore invitation events
        return res.status(200).json({ message: "Ignoring member_invited event" });
      case "member_added":
        // Create Permit user and assign role when added to org
        console.log("User added to organization.");
        await createPermitUserAssignRole(req.body);
        break;
      case "member_removed":
        // Remove Permit user when removed from org
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

// Create a Permit user and assign them a role based on GitHub data
async function createPermitUserAssignRole(body) {
  const { membership } = body;
  if (!membership || !membership.user || !membership.role) {
    throw new Error("Invalid membership data");
  }

  // Extract user info and role from GitHub payload
  const githubUsername = membership.user.login;
  const githubUserOrgRole = membership.role;

  console.log(`Creating Permit user: ${githubUsername} with role: ${githubUserOrgRole}`);

  try {
    // Create the user in Permit
    const userResponse = await permit.api.createUser({ key: githubUsername });
    console.log("User created successfully in Permit:", userResponse);

    // Assign the extracted role to the user in Permit
    const roleResponse = await permit.api.assignRole({
      user: userResponse.id,
      role: githubUserOrgRole,
      tenant: "default",
    });
    console.log("Role assigned successfully in Permit:", roleResponse);
  } catch (error) {
    console.error("Error creating user or assigning role in Permit:");
  }
}

// Remove a Permit user based on GitHub data
async function removePermitUser(body) {
  const { membership } = body;
  if (!membership || !membership.user) {
    throw new Error("Invalid membership data");
  }

  // Extract username from GitHub payload
  const githubUsername = membership.user.login;
  console.log(`Removing Permit user: ${githubUsername}`);

  try {
    // Delete the user from Permit
    const response = await permit.api.deleteUser(githubUsername);
    console.log("User removed successfully from Permit");
  } catch (error) {
    console.error("Error removing user from Permit");
  }
}

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
