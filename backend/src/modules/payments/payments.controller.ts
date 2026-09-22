import { Body, Controller, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator.js';
import { BuildPaymentTxDto } from './dto/build-payment-tx.dto.js';
import { SubmitPaymentDto } from './dto/submit-payment.dto.js';
import { PaymentsService } from './payments.service.js';

@ApiTags('payments')
@Public()
@Controller('v1/public/orders/:id')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Post('tx')
  async buildTx(@Param('id') id: string, @Body() dto: BuildPaymentTxDto) {
    const xdr = await this.payments.buildPaymentTx(id, dto.payerPublicKey);
    return { xdr };
  }

  @Post('submit')
  submit(@Param('id') id: string, @Body() dto: SubmitPaymentDto) {
    return this.payments.submitPayment(id, dto.signedXdr);
  }
}
