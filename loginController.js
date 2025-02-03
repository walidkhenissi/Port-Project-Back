const express = require('express');
const bodyParser = require('body-parser');

const loginRouter = express.Router();
loginRouter.use(bodyParser.json());

// Hardcoded user credentials (for demo purposes)
const users = [
  { username: 'john', password: 'password123' },
  { username: 'jane', password: 'pass456' },
];

loginRouter.post('/login', (req, res) => {
  const { username, password } = req.body;
  console.log("=====================>username : " + JSON.stringify(username));
  console.log("=====================>password : " + JSON.stringify(password));
  // Check if the username and password match any user in the hardcoded array
  const user = users.find((user) => user.username === username && user.password === password);

  if (user) {
    res.status(200).json({ message: 'Login successful', user: user.username });
  } else {
    res.status(401).json({ error: 'Invalid credentials' });
  }
});

module.exports = loginRouter;
