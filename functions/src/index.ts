import { onRequest } from 'firebase-functions/v2/https'
import * as logger from 'firebase-functions/logger'
import express from 'express'
import { ChatCompletionRequestMessage, Configuration, OpenAIApi } from 'openai'
import cors from 'cors'

const app = express()
app.use(cors({ origin: true }))

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

type HotelFact = {
  question: string
  choices: string[]
  answerIndex: number
  trivia: string
  references: string[]
}

const defaultEscapeRoomPrompt: ChatCompletionRequestMessage[] = [
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

const defaultHotelFactPrompt: ChatCompletionRequestMessage[] = [
  {
    role: 'system',
    content: `
      You are an expert about the history of hotels and hoteliers. And also about the modern hotels and booking platforms like airbnb, booking.com, agoda, etc. You also know a lot about countries and their attractions, cuisines and hospitalities. You only speak JSON. Do not write normal text.
    `,
  },
  {
    role: 'user',
    content: `
      Create an object that contains a question, choices, an answerIndex, a trivia, and references.
      The question is some interesting and fun quiz question.
      The choices are three options that are texts and one of them is the answer to the question.
      The answerIndex is the index of the correct answer in the choices.
      The trivia is elaborating more about the answer. The trivia should be at least three sentences.
      The references are url links that supports the trivia. Include a link to a wikipedia about the answer in the references, if possible.
    `,
  },
]

let escapeRoomsPromptHistory: ChatCompletionRequestMessage[] = [
  ...defaultEscapeRoomPrompt,
]

let hotelFactPromptHistory: ChatCompletionRequestMessage[] = [
  ...defaultHotelFactPrompt,
]

app.get('/escape-room', async (req, res) => {
  // resets the prompts
  if (escapeRoomsPromptHistory.length > 20) {
    escapeRoomsPromptHistory = [...defaultEscapeRoomPrompt]
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
    if (escapeRoomsPromptHistory[escapeRoomsPromptHistory.length - 1].role === 'user') {
      escapeRoomsPromptHistory.push({
        role: 'assistant',
        content: rawJson,
      })
    }

    return res.json(escapeRoom)
  } catch (err) {
    logger.error('Failed to generate an escape room', err)
  }

  return res.status(500).send('Something went wrong. Please try again.')
})

app.get('/hotel-fact', async (req, res) => {
  // resets the prompts
  if (hotelFactPromptHistory.length > 50) {
    hotelFactPromptHistory = [...defaultHotelFactPrompt]
  }

  // setups the prompts to make it more likely to provide a different response
  if (hotelFactPromptHistory[hotelFactPromptHistory.length - 1].role === 'assistant') {
    hotelFactPromptHistory.push({
      role: 'user',
      content: 'Give another one.',
    })
  }

  const response = await openai.createChatCompletion({
    model: 'gpt-3.5-turbo',
    messages: hotelFactPromptHistory,
  })

  try {
    const rawJson = response.data.choices[0].message?.content
    const hotelFact = JSON.parse(rawJson ?? '{}') as HotelFact
    logger.info('hotelFact', hotelFact)

    // setups the prompts to make it more likely to provide a different response
    if (hotelFactPromptHistory[hotelFactPromptHistory.length - 1].role === 'user') {
      hotelFactPromptHistory.push({
        role: 'assistant',
        content: rawJson,
      })
    }

    return res.json(hotelFact)
  } catch (err) {
    logger.error('Failed to generate a hotel fact', err)
  }

  return res.status(500).send('Something went wrong. Please try again.')
})

exports.api = onRequest(app)
