import fastifyFormBody from '@fastify/formbody'
import fastifyWs from '@fastify/websocket'
import Fastify, { type FastifyInstance } from 'fastify'

export const createServer = (): FastifyInstance => {
  const server = Fastify()
  server.register(fastifyFormBody)
  server.register(fastifyWs)
  return server
}
