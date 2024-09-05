const express = require('express')
const {open} = require('sqlite')
const sqlite3 = require('sqlite3')
const path = require('path')
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')

const databasePath = path.join(__dirname, 'twitterClone.db')

const app = express()

app.use(express.json())

let database = null

const initializeDbAndServer = async () => {
  try {
    database = await open({
      filename: databasePath,
      driver: sqlite3.Database,
    })

    app.listen(3000, () =>
      console.log('Server Running at http://localhost:3000/'),
    )
  } catch (error) {
    console.log(`DB Error: ${error.message}`)
    process.exit(1)
  }
}

initializeDbAndServer()

//mmmmmmmmmmmmmmmmmmmmmmmmmmmmmmnbbbbbbbbbbbbbbbbbbbbbbbbbbbb
const getFollowingPeopleIds = async username => {
  const getFollowingPeopleQouery = `
  select following_user_id from follower inner join user on user.user_id = follower.follower_user_id where user.username = '${username}';`
  const folloingPeople = await database.all(getFollowingPeopleQouery)
  const arrayOfFids = folloingPeople.map(eachUser => eachUser.following_user_id)
  return arrayOfFids
}

/////bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmm

const authenticationToken = (request, response, next) => {
  let jwtToken
  const authHeader = request.headers['authorization']

  if (authHeader) {
    jwtToken = authHeader.split(' ')[1]
  }
  if (jwtToken) {
    jwt.verify(jwtToken, 'mahendra', async (error, payload) => {
      if (error) {
        response.status(401)
        response.send('Invalid JWT Token')
      } else {
        request.username = payload.username
        request.userId = payload.userId
        next()
      }
    })
  } else {
    response.status(401)
    response.send('Invalid JWT Token')
  }
}

////////////////////////mmmmmmmmmmmmmmmmmmmmmmmmmmmm

const tweetAccessVerification = async (request, response, next) => {
  const {userId} = request
  const {tweetId} = request.params
  const getTweetQuery = `
  select * from tweet inner join follower on tweet.user_id = follower.following_user_id
  where tweet.tweet_id = '${tweetId}' and follower_user_id = '${userId}';`
  const tweet = await database.get(getTweetQuery)
  if (tweet === undefined) {
    response.status(401)
    response.send('Invalid Request')
  } else {
    next()
  }
}
//mmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb

app.post('/register/', async (request, response) => {
  const {username, password, name, gender} = request.body
  const getUserQuery = `
  select * from user where username = '${username}'`

  const userDbdetails = await database.get(getUserQuery)

  if (userDbdetails !== undefined) {
    response.status(400)
    response.send('User already exists')
  } else {
    if (password.length < 6) {
      response.status(400)
      response.send('Password is too short')
    } else {
      const hashedPassword = await bcrypt.hash(password, 10)
      const creatUserQuery = `insert into user(username, password, name, gender)
      values('${username}','${hashedPassword}','${name}','${gender}')`
      await database.run(creatUserQuery)
      response.send('User created Successfully')
    }
  }
})

//mmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb

app.post('/login/', async (request, response) => {
  const {username, password} = request.body
  const getUserQuery = `select * from user where username = '${username}';`
  const userDbdetails = await database.get(getUserQuery)
  if (userDbdetails !== undefined) {
    const isPasswordCorrecr = await bcrypt.compare(
      password,
      userDbdetails.password,
    )
    if (isPasswordCorrecr) {
      const payload = {username, userId: userDbdetails.user_id}
      const jwtToken = jwt.sign(payload, 'mahendra')
      response.send({jwtToken})
    } else {
      response.status(400)
      response.send('Invalid password')
    }
  }
})

//mmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb

app.get(
  '/user/tweets/feed/',
  authenticationToken,
  async (request, response) => {
    const {username} = request
    const followingPeopleIds = await getFollowingPeopleIds(username)
    const getTweetQuery = `
  select username, tweet, date_time as dateTime from user inner join tweet on user.user_id = tweet.user_id
  where user.user_id in (${followingPeopleIds})
  order by date_time desc limit 4;
  `
    const tweets = await database.all(getTweetQuery)
    response.send(tweets)
  },
)

//mmmmmmmmmmmmmmmmmmmmmmmmmmmbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb

app.get('/user/following/', authenticationToken, async (request, response) => {
  const {username, userId} = request
  const getFollowingPeopleQouery = `
  select name from follower
  inner join user on user.user_id = follower.following_user_id
  where follower_user_id = '${userId}';`

  const folloingPeople = await database.all(getFollowingPeopleQouery)
  response.send(folloingPeople)
})

//mmmmmmmmmmmmmmmmmmmmmmmmbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb

app.get('/user/followers/', authenticationToken, async (request, response) => {
  const {username, userId} = request
  const getFollowingPeopleQouery = `
  select distinct name from follower inner join user on user.user_id = follower.follower_user_id where following_user_id = '${userId}';`
  const follower = await database.all(getFollowingPeopleQouery)
  response.send(follower)
})

//mbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb

app.get(
  '/tweets/:tweetId/',
  authenticationToken,
  tweetAccessVerification,
  async (request, response) => {
    const {username, userId} = request
    const {tweetId} = request.params
    const getTweetQuery = `
  select tweet, (select count() from like where tweet_id = '${tweetId}') as likes,
  (select count() from reply where tweet_id = '${tweetId}') as replies,
  date_time as dateTime from tweet where tweet.tweet_id = '${tweetId}';`
    const tweet = await database.get(getTweetQuery)
    response.send(tweet)
  },
)
//mmmmmmmmmmmmmmmmbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb

app.get(
  '/tweets/:tweetId/likes/',
  authenticationToken,
  tweetAccessVerification,
  async (request, response) => {
    const {tweetId} = request.params
    const getTweetQuery = `
  select username from user inner join like on user.user_id = like.user_id where
  tweet_id = '${tweetId}';`
    const tweets = await database.all(getTweetQuery)
    const userArray = tweets.map(eachUser => eachUser.username)
    response.send({likes: userArray})
  },
)

//,,,,,,,,,,,,mmmmmmmmmmmmmmmmmmmmmmmmmbbbbbbbbbbbbbbbbbbbbbbbbbbbbb

app.get(
  '/tweets/:tweetId/replies/',
  authenticationToken,
  tweetAccessVerification,
  async (request, response) => {
    const {username, userId} = request
    const {tweetId} = request.params
    const getTweetQuery = `
  select name , reply from user inner join reply on user.user_id = reply.user_id
  where tweet_id = '${tweetId}';`
    const tweets = await database.all(getTweetQuery)
    response.send({likes: tweets})
  },
)

//mmmmmmmmmmmmmmmmmmmmmmmmmmbbbbbbbbbbbbbbbb

app.get('/user/tweets/', authenticationToken, async (request, response) => {
  const {userId} = request
  const getTweetQuery = `
  select tweet, count(DISTINCT like_id) as likes,
  count(DISTINCT reply_id) as replies,
  date_time as dateTime from tweet left join reply on tweet.tweet_id = reply.tweet_id
  left join like on tweet.tweet_id = like.tweet_id
  where tweet.user_id = ${userId}
  group by tweet.tweet_id;`
  const tweets = await database.all(getTweetQuery)
  response.send(tweets)
})

//mmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb

//mmmmmmmmmmmmbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb

app.post('/user/tweets/', authenticationToken, async (request, response) => {
  const {tweet} = request.body
  const userId = parseInt(request.userId)
  const dateTime = new Date().toJSON().substring(0, 19).replace('T', ' ')
  const createTweetQuery = `
  insert into tweet(tweet, user_id, date_time)
  values('${tweet}','${userId}','${dateTime}')`
  await database.run(createTweetQuery)
  response.send('Created a Tweet')
})
///mmmmmmmmmmmmmmmmmmmmmmmmmmbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb

app.delete(
  '/tweets/:tweetId/',
  authenticationToken,
  async (request, response) => {
    const {tweetId} = request.params
    const {userId} = request
    const createTweetQuery = `select * from tweet where user_id = '${userId}' and tweet_id = '${tweetId}';`
    const tweets = await database.get(createTweetQuery)

    if (tweets === undefined) {
      response.status(401)
      response.send('Invalid Request')
    } else {
      const deleteTweetQuery = `delete from tweet where tweet_id = '${tweetId}';`
      await database.run(deleteTweetQuery)
      response.send('Tweet Removed')
    }
  },
)
module.exports = app
