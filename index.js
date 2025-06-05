const core = require("@actions/core")
const github = require("@actions/github")
const axios = require("axios")

const sleep = (seconds) =>
  new Promise((resolve) => setTimeout(resolve, seconds * 1000))

const headers = {
  Authorization: `Bearer ${core.getInput("token")}`,
}

async function getDeployment(sha) {
  const url = "https://api.vercel.com/v5/now/deployments"
  const params = {
    "meta-githubCommitSha": sha,
    teamId: core.getInput("team-id"),
    projectId: core.getInput("project-id"),
  }
  const { data } = await axios.get(url, {
    params,
    headers,
  })

  if (!data.deployments.length) {
    throw new Error("No matching deployments")
  }
  return data.deployments[0]
}

function checkDeployment(deployment) {
  const status = deployment.status || deployment.state
  if (status !== "READY") {
    throw new Error("Deployment isn't ready")
  }
}

async function waitForDeployment() {
  const sha = core.getInput('commit-id') || github.context.payload.head_commit.id
  const timeout = +core.getInput("timeout") * 1000
  const endTime = new Date().getTime() + timeout

  let attempt = 1

  while (new Date().getTime() < endTime) {
    try {
      const deployment = await getDeployment(sha)
      console.log(deployment)
      checkDeployment(deployment)
      return `https://${deployment.url}`
    } catch (err) {
      console.log(`Url unavailable. Attempt ${attempt++}.`)
      console.log(err)
      await sleep(2)
    }
  }

  throw new Error(`Timeout reached before deployment for ${sha} was found.`)
}

;(async () => {
  try {
    const url = await waitForDeployment()
    console.log("Url found!", url)
    core.setOutput("url", url)
  } catch (err) {
    core.setFailed(err.message)
  }
})()
