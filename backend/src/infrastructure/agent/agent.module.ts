import { Module } from '@nestjs/common';
import { AGENT_PROVIDER } from './agent-provider.interface.js';
import { RavenClient } from './raven-client.service.js';

@Module({
  providers: [{ provide: AGENT_PROVIDER, useClass: RavenClient }],
  exports: [AGENT_PROVIDER],
})
export class AgentModule {}
