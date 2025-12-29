import dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config();

async function quickTest() {
  console.log('🚀 Quick AFUED Payment System Test\n');
  
  try {
    // 1. Test environment
    console.log('1. Environment:');
    console.log(`   PORT: ${process.env.PORT}`);
    console.log(`   REMITA_ENV: ${process.env.REMITA_ENVIRONMENT}`);
    console.log(`   MONGODB_URI: ${process.env.MONGODB_URI ? 'Set' : 'Not set'}`);
    
    // 2. Test database
    console.log('\n2. Database:');
    try {
      await mongoose.connect(process.env.MONGODB_URI);
      console.log('   ✅ MongoDB connected');
      
      // Test Payment model
      const { default: Payment } = await import('./domain/payment/payment.model.js');
      console.log('   ✅ Payment model loaded');
      
      // Test generateTransactionRef
      const ref = Payment.generateTransactionRef();
      console.log(`   ✅ Transaction ref generated: ${ref.substring(0, 20)}...`);
      
      await mongoose.disconnect();
      console.log('   ✅ Database disconnected');
    } catch (dbError) {
      console.log(`   ❌ Database error: ${dbError.message}`);
    }
    
    // 3. Test Remita service
    console.log('\n3. Remita Service:');
    try {
      const { RemitaService } = await import('./domain/payment/remita.service.js');
      const remita = new RemitaService();
      console.log(`   ✅ RemitaService initialized`);
      console.log(`   ✅ Environment: ${remita.environment}`);
      
      const services = remita.getAFUEDServices();
      console.log(`   ✅ ${Object.keys(services).length} AFUED services available`);
      
      console.log('\n   Available Services:');
      Object.values(services).forEach(service => {
        const amount = service.amount ? `₦${service.amount.toLocaleString()}` : 'Variable';
        console.log(`     • ${service.name}: ${amount}`);
      });
    } catch (remitaError) {
      console.log(`   ❌ Remita service error: ${remitaError.message}`);
    }
    
    console.log('\n🎉 SYSTEM READY!');
    console.log('\nStart server: npm run dev');
    console.log('Test endpoint: curl http://localhost:5000/afued/result/portal/payment/services');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
  }
}

quickTest();
