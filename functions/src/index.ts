import { onRequest } from 'firebase-functions/v2/https'
import * as logger from 'firebase-functions/logger'
import express from 'express'
import { ChatCompletionRequestMessage, Configuration, OpenAIApi } from 'openai'

const app = express()

const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
})
const openai = new OpenAIApi(configuration)

type EscapeRoom = {
  roomName: string
  description: string
  answer: string
  imageUrl?: string
}

const defaultPrompt: ChatCompletionRequestMessage[] = [
  {
    role: 'system',
    content: 'You are a game designer for an escape room web application. You only speak JSON. Do not write normal text.',
  },
  {
    role: 'user',
    content: `
      Create an object that contains a roomName, description, and answer.
      The description describes an escape room with at least four sentences and gives a riddle.
      The roomName property is the name of the escape room.
      The answer is a one word answer to the riddle.
    `,
  },
]

let escapeRoomsPromptHistory: ChatCompletionRequestMessage[] = [
  ...defaultPrompt,
]

app.get('/escape-room', async (req, res) => {
  // resets the prompts
  if (escapeRoomsPromptHistory.length > 20) {
    escapeRoomsPromptHistory = [...defaultPrompt]
  }

  // setups the prompts to make it more likely to provide a different response
  if (escapeRoomsPromptHistory[escapeRoomsPromptHistory.length - 1].role === 'assistant') {
    escapeRoomsPromptHistory.push({
      role: 'user',
      content: 'Give another one.',
    })
  }

  const response = await openai.createChatCompletion({
    model: 'gpt-3.5-turbo',
    messages: escapeRoomsPromptHistory,
  })

  try {
    const rawJson = response.data.choices[0].message?.content
    const parsedJson = JSON.parse(rawJson ?? '{}')
    const escapeRoom = (parsedJson.escapeRoom ?? parsedJson.room ?? parsedJson) as EscapeRoom
    logger.info('escapeRoom', escapeRoom)

    const imageUrl = (await openai.createImage({
      prompt: escapeRoom.description,
      n: 1,
      size: '256x256',
    })).data.data[0].url

    escapeRoom.imageUrl = imageUrl

    // setups the prompts to make it more likely to provide a different response
    escapeRoomsPromptHistory.push({
      role: 'assistant',
      content: rawJson,
    })

    return res.json(escapeRoom)
  } catch (err) {
    logger.error('Failed to generate an escape room', err)
  }

  return res.status(500).send('Something went wrong. Please try again.')
})

exports.api = onRequest(app)
