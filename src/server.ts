import fastifyFormBody from '@fastify/formbody'
import fastifyWs from '@fastify/websocket'
import Fastify, { type FastifyInstance } from 'fastify'
import * as Sentry from '@sentry/node'

export const createServer = (): FastifyInstance => {
  const server = Fastify()
  Sentry.setupFastifyErrorHandler(server)
  server.register(fastifyFormBody)
  server.register(fastifyWs)
  return server
}
