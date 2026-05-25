const { handleServerlessApi } = require("../server");

module.exports = async function gateway(req, res) {
  const route = Array.isArray(req.query.route)
    ? req.query.route.join("/")
    : req.query.route || "";

  await handleServerlessApi(req, res, route);
};
