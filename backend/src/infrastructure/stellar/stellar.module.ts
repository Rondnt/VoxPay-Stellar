import { Global, Module } from '@nestjs/common';
import { SorobanService } from './soroban.service.js';

@Global()
@Module({
  providers: [SorobanService],
  exports: [SorobanService],
})
export class StellarModule {}
