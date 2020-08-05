const core = require("@actions/core")
const github = require("@actions/github")
const axios = require("axios")

const sleep = (seconds) =>
  new Promise((resolve) => setTimeout(resolve, seconds * 1000))

const headers = {
  Authorization: `Bearer ${core.getInput("token")}`,
}

async function getProdUrl(sha) {
  const url = "https://api.vercel.com/v11/now/deployments/get"
  const params = {
    url: core.getInput("prod-url", { required: true }),
    teamId: core.getInput("team-id"),
  }
  const { data } = await axios.get(url, {
    params,
    headers,
  })

  if (data.meta.githubCommitSha === sha) {
    throw new Error("Commit sha for prod url didn't match")
  }

  return data.url
}

async function getBranchUrl(sha) {
  const url = "https://api.vercel.com/v5/now/deployments"
  const params = {
    "meta-githubCommitSha": sha,
    teamId: core.getInput("team-id"),
  }
  const { data } = await axios.get(url, {
    params,
    headers,
  })

  if (!data.deployments.length) {
    throw new Error("No matching deployments")
  }
  // If the deployment isn't in the response, this will throw an error and
  // cause a retry.
  return data.deployments[0].url
}

function getUrl(sha) {
  return github.context.payload.ref === "refs/heads/master"
    ? getProdUrl(sha)
    : getBranchUrl(sha)
}

async function waitForDeployment() {
  const sha = github.context.payload.head_commit.id
  const timeout = +core.getInput("timeout") * 1000
  const endTime = new Date().getTime() + timeout

  let attempt = 1

  while (new Date().getTime() < endTime) {
    try {
      return `http://${await getUrl(sha)}`
    } catch (e) {
      core.debug("Failed: ", e)
      console.log(`Url unavailable. Attempt ${attempt++}.`)
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
