# Cloud Services Deployment Guide

This guide covers deploying the AI API Proxy Server on various cloud platforms. Cloud services provide managed infrastructure, automatic scaling, and built-in monitoring.

## Available Cloud Platforms

### AWS (Amazon Web Services)
- **Elastic Beanstalk**: Easy deployment with automatic scaling
- **ECS (Elastic Container Service)**: Container orchestration
- **EC2**: Virtual servers with full control
- **Lambda**: Serverless functions
- **Lightsail**: Simple VPS hosting

### Google Cloud Platform
- **Cloud Run**: Serverless containers
- **App Engine**: Managed application platform
- **Compute Engine**: Virtual machines
- **Cloud Functions**: Serverless functions

### Microsoft Azure
- **App Service**: Web app hosting
- **Container Instances**: Container hosting
- **Functions**: Serverless functions
- **Virtual Machines**: IaaS hosting

### Heroku
- **Simple deployment**: Git-based deployment
- **Add-ons**: Managed services
- **Docker support**: Container deployment

## AWS Deployment

### 1. AWS Elastic Beanstalk

#### Prerequisites
- AWS CLI installed and configured
- Elastic Beanstalk CLI (optional)
- IAM user with appropriate permissions

#### Deployment Steps

```bash
# Install Elastic Beanstalk CLI
pip install awsebcli

# Initialize Elastic Beanstalk
eb init -p "Node.js" your-app-name

# Create environment
eb create production

# Deploy application
eb deploy

# Check environment status
eb status
```

#### Configuration File (`.ebextensions/01_python.config`)

```yaml
option_settings:
  aws:elasticbeanstalk:container:nodejs:
    NodeCommand: "npm start"
    NodeVersion: "18"
    ProxyServer: "nginx"
  aws:elasticbeanstalk:application:environment:
    NODE_ENV: "production"
    PORT: "8080"
    ADMIN_API_KEY: "your_admin_api_key"
    ENABLE_RATE_LIMITING: "true"
    RATE_LIMIT_WINDOW_MS: "900000"
    RATE_LIMIT_MAX_REQUESTS: "100"
```

#### Environment Variables

```bash
# Set environment variables
eb setenv \
  NODE_ENV=production \
  PORT=8080 \
  ADMIN_API_KEY=your_admin_api_key \
  ENABLE_RATE_LIMITING=true \
  RATE_LIMIT_WINDOW_MS=900000 \
  RATE_LIMIT_MAX_REQUESTS=100
```

### 2. AWS ECS (Elastic Container Service)

#### Task Definition

```json
{
  "family": "ai-api-proxy",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "256",
  "memory": "512",
  "executionRoleArn": "arn:aws:iam::account:role/ecsTaskExecutionRole",
  "containerDefinitions": [
    {
      "name": "ai-api-proxy",
      "image": "your-account.dkr.ecr.region.amazonaws.com/ai-api-proxy:latest",
      "portMappings": [
        {
          "containerPort": 8080,
          "protocol": "tcp"
        }
      ],
      "environment": [
        {
          "name": "NODE_ENV",
          "value": "production"
        },
        {
          "name": "PORT",
          "value": "8080"
        },
        {
          "name": "ADMIN_API_KEY",
          "value": "your_admin_api_key"
        }
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/ai-api-proxy",
          "awslogs-region": "us-east-1",
          "awslogs-stream-prefix": "ecs"
        }
      }
    }
  ]
}
```

#### Service Definition

```json
{
  "cluster": "ai-api-proxy-cluster",
  "serviceName": "ai-api-proxy-service",
  "taskDefinition": "ai-api-proxy",
  "desiredCount": 3,
  "deploymentConfiguration": {
    "maximumPercent": 200,
    "minimumHealthyPercent": 50
  },
  "launchType": "FARGATE",
  "networkConfiguration": {
    "awsvpcConfiguration": {
      "subnets": ["subnet-12345678"],
      "securityGroups": ["sg-12345678"],
      "assignPublicIp": "ENABLED"
    }
  },
  "loadBalancers": [
    {
      "targetGroupArn": "arn:aws:elasticloadbalancing:region:account:targetgroup/ai-api-proxy/1234567890123456",
      "containerName": "ai-api-proxy",
      "containerPort": 8080
    }
  ]
}
```

### 3. AWS Lambda (Serverless)

#### Lambda Function

```javascript
// lambda-handler.js
const { spawn } = require('child_process');

exports.handler = async (event, context) => {
  try {
    // Spawn the Node.js process
    const child = spawn('node', ['-e', `
      require('dotenv').config();
      const express = require('express');
      const app = express();
      
      // Your server setup here
      app.get('/health', (req, res) => {
        res.json({ status: 'healthy' });
      });
      
      const PORT = process.env.PORT || 8080;
      app.listen(PORT, () => {
        console.log('Server running on port', PORT);
      });
    `]);

    // Handle the request
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({ message: 'Server started successfully' })
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};
```

## Google Cloud Platform Deployment

### 1. Google Cloud Run

#### Build and Deploy

```bash
# Build and push to Container Registry
gcloud builds submit --tag gcr.io/PROJECT-ID/ai-api-proxy

# Deploy to Cloud Run
gcloud run deploy ai-api-proxy \
  --image gcr.io/PROJECT-ID/ai-api-proxy \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars="NODE_ENV=production,PORT=8080,ADMIN_API_KEY=your_admin_key"
```

#### Configuration File (`cloudbuild.yaml`)

```yaml
steps:
  - name: 'node:18'
    entrypoint: 'npm'
    args: ['ci', '--only=production']
  
  - name: 'node:18'
    entrypoint: 'npm'
    args: ['run', 'build']
  
  - name: 'gcr.io/cloud-builders/docker'
    args: ['build', '-t', 'gcr.io/$PROJECT_ID/ai-api-proxy', '.']
  
  - name: 'gcr.io/cloud-builders/gcloud'
    args: ['run', 'deploy', 'ai-api-proxy', '--image', 'gcr.io/$PROJECT_ID/ai-api-proxy', '--platform', 'managed', '--region', 'us-central1']

images:
  - 'gcr.io/$PROJECT_ID/ai-api-proxy'
```

### 2. Google App Engine

#### `app.yaml` Configuration

```yaml
runtime: nodejs18
instance_class: F2
automatic_scaling:
  min_num_instances: 1
  max_num_instances: 10
  cool_down_period_sec: 120

env_variables:
  NODE_ENV: "production"
  PORT: "8080"
  ADMIN_API_KEY: "your_admin_api_key"
  ENABLE_RATE_LIMITING: "true"
  RATE_LIMIT_WINDOW_MS: "900000"
  RATE_LIMIT_MAX_REQUESTS: "100"

handlers:
  - url: /.*
    script:
      auto: true
```

#### `package.json` Scripts

```json
{
  "scripts": {
    "start": "node index.js",
    "dev": "nodemon index.js"
  }
}
```

## Microsoft Azure Deployment

### 1. Azure App Service

#### Deployment via CLI

```bash
# Create resource group
az group create --name ai-proxy-rg --location eastus

# Create App Service plan
az appservice plan create --name ai-proxy-plan --resource-group ai-proxy-rg --sku B1 --is-linux

# Create Web App
az webapp create --resource-group ai-proxy-rg --plan ai-proxy-plan --name ai-proxy-app --runtime "NODE:18-lts" --deployment-local-git

# Set environment variables
az webapp config appsettings set --resource-group ai-proxy-rg --name ai-proxy-app --settings \
  NODE_ENV=production \
  PORT=8080 \
  ADMIN_API_KEY=your_admin_api_key \
  ENABLE_RATE_LIMITING=true \
  RATE_LIMIT_WINDOW_MS=900000 \
  RATE_LIMIT_MAX_REQUESTS=100

# Deploy code
git remote add azure https://azure-user@scm.azurewebsites.net/ai-proxy-app.git
git push azure main
```

### 2. Azure Container Instances

#### Deployment Script

```bash
# Create container group
az container create --resource-group ai-proxy-rg --name ai-proxy-container \
  --image your-registry.azurecr.io/ai-api-proxy:latest \
  --dns-name-label ai-proxy-dns \
  --ports 8080 \
  --environment-variables \
    NODE_ENV=production \
    PORT=8080 \
    ADMIN_API_KEY=your_admin_api_key \
    ENABLE_RATE_LIMITING=true \
    RATE_LIMIT_WINDOW_MS=900000 \
    RATE_LIMIT_MAX_REQUESTS=100
```

## Heroku Deployment

### 1. Setup Heroku App

```bash
# Install Heroku CLI
npm install -g heroku

# Login to Heroku
heroku login

# Create Heroku app
heroku create your-app-name

# Set environment variables
heroku config:set NODE_ENV=production
heroku config:set PORT=8080
heroku config:set ADMIN_API_KEY=your_admin_api_key
heroku config:set ENABLE_RATE_LIMITING=true
heroku config:set RATE_LIMIT_WINDOW_MS=900000
heroku config:set RATE_LIMIT_MAX_REQUESTS=100

# Add buildpack
heroku buildpacks:set heroku/nodejs

# Deploy
git push heroku main
```

### 2. `Procfile`

```
web: npm start
```

### 3. Scaling

```bash
# Scale dynos
heroku ps:scale web=2

# Enable autoscaling
heroku ps:autoscale --min=2 --max=10 --type=performance-m
```

## Cloud Platform Comparison

| Feature | AWS Elastic Beanstalk | AWS ECS | Google Cloud Run | Azure App Service | Heroku |
|---------|----------------------|---------|------------------|-------------------|--------|
| Ease of Use | High | Medium | High | High | Very High |
| Scalability | Automatic | Automatic | Automatic | Automatic | Automatic |
| Cost Control | Good | Good | Excellent | Good | Good |
| Monitoring | Built-in | Built-in | Built-in | Built-in | Built-in |
| Customization | Medium | High | Medium | Medium | Low |
| Security | Good | Excellent | Excellent | Good | Good |
| Deployment Speed | Fast | Medium | Fast | Fast | Very Fast |

## Security Configuration

### 1. AWS Security

```bash
# Create IAM role for ECS
aws iam create-role --role-name ecsTaskExecutionRole --assume-role-policy-document file://trust-policy.json

# Attach policies
aws iam attach-role-policy --role-name ecsTaskExecutionRole --policy-arn arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy

# Create security group
aws ec2 create-security-group --group-name ai-proxy-sg --description "AI Proxy Security Group"

# Authorize ingress
aws ec2 authorize-security-group-ingress --group-name ai-proxy-sg --protocol tcp --port 8080 --cidr 0.0.0.0/0
```

### 2. Google Cloud Security

```bash
# Create service account
gcloud iam service-accounts create ai-proxy-service-account \
  --display-name="AI Proxy Service Account"

# Grant roles
gcloud projects add-iam-policy-binding PROJECT_ID \
  --member="serviceAccount:ai-proxy-service-account@PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/run.admin"

# Create VPC network
gcloud compute networks create ai-proxy-network --subnet-mode=auto
```

### 3. Azure Security

```bash
# Create service principal
az ad sp create-for-rbac --name "ai-proxy-sp" --role "Contributor"

# Create key vault
az keyvault create --name ai-proxy-kv --resource-group ai-proxy-rg --location eastus

# Set secrets
az keyvault secret set --vault-name ai-proxy-kv --name admin-api-key --value your_admin_key
```

## Monitoring and Logging

### 1. AWS CloudWatch

```bash
# Create log group
aws logs create-log-group --log-group-name /ecs/ai-api-proxy

# Create log stream
aws logs create-log-stream --log-group-name /ecs/ai-api-proxy --log-stream-name ai-proxy-stream

# Set up alarms
cloudwatch put-metric-alarm --alarm-name ai-proxy-high-cpu --alarm-description "CPU usage too high" \
  --metric-name CPUUtilization --namespace AWS/ECS --statistic Average --period 300 --threshold 80 \
  --comparison-operator GreaterThanThreshold --evaluation-periods 2 --alarm-actions arn:aws:sns:us-east-1:account:alarm-topic
```

### 2. Google Cloud Monitoring

```bash
# Create alerting policy
gcloud alpha monitoring policies create \
  --display-name="AI Proxy High CPU" \
  --condition="resource.type=gce_instance AND metric.type=compute.googleapis.com/instance/cpu/utilization AND metric.utilization > 0.8" \
  --combiner="OR" \
  --notification-channels="projects/PROJECT_ID/notificationChannels/CHANNEL_ID"
```

### 3. Azure Monitor

```bash
# Create alert rule
az monitor metrics alert create --name ai-proxy-cpu-alert --resource-group ai-proxy-rg \
  --scopes /subscriptions/SUBSCRIPTION_ID/resourceGroups/ai-proxy-rg/providers/Microsoft.Web/sites/ai-proxy-app \
  --condition "avg PercentageCPU > 80" --description "High CPU usage" \
  --action-group "/subscriptions/SUBSCRIPTION_ID/resourceGroups/ai-proxy-rg/providers/microsoft.insights/actionGroups/ai-proxy-action-group"
```

## Cost Optimization

### 1. AWS Cost Optimization

```bash
# Use spot instances for ECS
aws ecs update-service --cluster ai-proxy-cluster --service ai-proxy-service --force-new-deployment \
  --configuration-override '{"taskDefinition": {"containerDefinitions": [{"name": "ai-api-proxy", "resourceRequirements": [{"value": "1", "type": "GPU"}]}]}}'

# Set up auto-scaling
aws application-autoscaling register-scalable-target \
  --service-namespace ecs \
  --resource-id service/ai-proxy-cluster/ai-proxy-service \
  --scalable-dimension ecs:service:DesiredCount \
  --min-capacity 1 \
  --max-capacity 10
```

### 2. Google Cloud Cost Optimization

```bash
# Enable cost exporter
gcloud services enable monitoring.googleapis.com
gcloud services enable cloudmonitoring.googleapis.com

# Set up budget alerts
gcloud alpha budgets create \
  --display-name="AI Proxy Budget" \
  --budget-alert-rules "amount=1000,alert-spent-buckets=0.5,0.75,0.9,1.0" \
  --services "6F81-5844-456A" \
  --project PROJECT_ID
```

### 3. Azure Cost Optimization

```bash
# Enable cost management
az feature register --name CostManagement --namespace Microsoft.CostManagement

# Create budget
az consumption budget create \
  --name ai-proxy-budget \
  --amount 1000 \
  --time-grain Monthly \
  --subscription SUBSCRIPTION_ID \
  --resource-group ai-proxy-rg
```

## Disaster Recovery

### 1. AWS Multi-Region Deployment

```bash
# Create secondary region deployment
aws elasticbeanstalk create-application-version \
  --application-name ai-proxy \
  --version-label v2-secondary \
  --source-bundle S3Bucket=bucket-name,S3Key=app.zip

# Create environment in secondary region
eb create production-secondary --region us-west-2
```

### 2. Google Cloud Multi-Region

```bash
# Deploy to multiple regions
gcloud run deploy ai-proxy-us-central1 \
  --image gcr.io/PROJECT-ID/ai-api-proxy \
  --platform managed \
  --region us-central1

gcloud run deploy ai-proxy-us-east1 \
  --image gcr.io/PROJECT_ID/ai-api-proxy \
  --platform managed \
  --region us-east1
```

### 3. Azure Multi-Region

```bash
# Create traffic manager profile
az network traffic-manager profile create \
  --name ai-proxy-tm \
  --resource-group ai-proxy-rg \
  --routing-method Performance \
  --monitor-protocol HTTPS \
  --monitor-path /health \
  --monitor-port 8080
```

## Production Deployment Checklist

### AWS
- [ ] Configure Elastic Beanstalk environment
- [ ] Set up environment variables
- [ ] Configure auto-scaling
- [ ] Set up CloudWatch monitoring
- [ ] Configure security groups
- [ ] Set up backup and recovery
- [ ] Configure cost optimization

### Google Cloud
- [ ] Deploy to Cloud Run
- [ ] Set up environment variables
- [ ] Configure auto-scaling
- [ ] Set up Cloud Monitoring
- [ ] Configure VPC network
- [ ] Set up backup and recovery
- [ ] Configure cost optimization

### Azure
- [ ] Deploy to App Service
- [ ] Set up environment variables
- [ ] Configure auto-scaling
- [ ] Set up Azure Monitor
- [ ] Configure NSG
- [ ] Set up backup and recovery
- [ ] Configure cost optimization

### Heroku
- [ ] Create Heroku app
- [ ] Set up environment variables
- [ ] Configure dyno scaling
- [ ] Set up monitoring
- [ ] Configure add-ons
- [ ] Set up backup and recovery

## Next Steps

1. Choose your preferred cloud platform
2. Follow the deployment steps for your chosen platform
3. Configure security and monitoring
4. Set up backup and disaster recovery
5. Test deployment with sample requests
6. Monitor performance and costs

For more information about the AI API Proxy Server, see the main [Public Server Setup Guide](../public-server-setup.md).