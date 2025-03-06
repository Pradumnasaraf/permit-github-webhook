const { Permit } = require("permitio");
const express = require("express");

const app = express();
const PORT = 4000;
const PDP = "http://localhost:7766";
const PERMIT_TOKEN = "permit_key_Tdfdgfg";

const permit = new Permit({
  pdp: PDP,
  token: PERMIT_TOKEN,
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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
      tenant: "default",
    });
    console.log("Role assigned successfully in Permit:", roleResponse);
  } catch (error) {
    console.error("Error creating user or assigning role in Permit:");
  }
}

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