# External Integrations

Perfornium provides comprehensive integration capabilities with monitoring systems, CI/CD pipelines, notification services, and data platforms. These integrations enable seamless workflows and automated performance monitoring.

## Overview

External integrations support:
- Real-time metric streaming
- Alerting and notifications
- CI/CD pipeline integration
- Data warehousing and analytics
- Incident management
- Custom webhooks and APIs

## Monitoring Systems

### Prometheus Integration

<!-- tabs:start -->

#### **YAML**
```yaml
outputs:
  prometheus:
    enabled: true
    endpoint: "http://prometheus:9090"
    pushgateway: "http://pushgateway:9091"

    metrics:
      - name: "perfornium_response_time"
        type: "histogram"
        help: "Response time distribution"
        labels:
          - endpoint
          - method
          - status_code

      - name: "perfornium_throughput"
        type: "gauge"
        help: "Requests per second"

      - name: "perfornium_error_rate"
        type: "gauge"
        help: "Error rate percentage"

    push_interval: 10s
    job_name: "perfornium-test"
    instance: "{{env.HOSTNAME}}"
```

#### **TypeScript**
```typescript
import { test } from '@testsmith/perfornium/dsl';

test('Load Test')
  .withPrometheus({
    enabled: true,
    endpoint: 'http://prometheus:9090',
    pushgateway: 'http://pushgateway:9091',
    metrics: [
      {
        name: 'perfornium_response_time',
        type: 'histogram',
        help: 'Response time distribution',
        labels: ['endpoint', 'method', 'status_code']
      },
      {
        name: 'perfornium_throughput',
        type: 'gauge',
        help: 'Requests per second'
      },
      {
        name: 'perfornium_error_rate',
        type: 'gauge',
        help: 'Error rate percentage'
      }
    ],
    push_interval: '10s',
    job_name: 'perfornium-test',
    instance: '{{env.HOSTNAME}}'
  })
  .run();
```

<!-- tabs:end -->

### Grafana Dashboards

```yaml
outputs:
  grafana:
    enabled: true
    url: "http://grafana:3000"
    api_key: "{{env.GRAFANA_API_KEY}}"
    
    dashboards:
      - name: "Performance Test Overview"
        template: "perfornium-overview.json"
        folder: "Performance Tests"
        
      - name: "Real-time Metrics"
        auto_create: true
        panels:
          - response_times
          - throughput
          - error_rates
          - virtual_users
    
    annotations:
      enabled: true
      tags: ["performance-test", "perfornium"]
      text: "Test: {{test_name}} - Duration: {{duration}}"
```

### InfluxDB Integration

<!-- tabs:start -->

#### **YAML**
```yaml
outputs:
  influxdb:
    enabled: true
    url: "http://influxdb:8086"
    database: "performance_metrics"
    username: "{{env.INFLUXDB_USER}}"
    password: "{{env.INFLUXDB_PASSWORD}}"

    measurement: "perfornium_metrics"
    tags:
      test_name: "{{test_name}}"
      environment: "{{env.ENVIRONMENT}}"
      version: "{{env.APP_VERSION}}"

    batch_size: 1000
    flush_interval: 10s
    retention_policy: "30d"
```

#### **TypeScript**
```typescript
import { test } from '@testsmith/perfornium/dsl';

test('Load Test')
  .withInfluxDB({
    url: 'http://influxdb:8086',
    database: 'performance_metrics',
    username: process.env.INFLUXDB_USER,
    password: process.env.INFLUXDB_PASSWORD,
    measurement: 'perfornium_metrics',
    tags: {
      test_name: '{{test_name}}',
      environment: process.env.ENVIRONMENT,
      version: process.env.APP_VERSION
    },
    batch_size: 1000,
    flush_interval: '10s',
    retention_policy: '30d'
  })
  .run();
```

<!-- tabs:end -->

### Datadog Integration

```yaml
outputs:
  datadog:
    enabled: true
    api_key: "{{env.DATADOG_API_KEY}}"
    app_key: "{{env.DATADOG_APP_KEY}}"
    
    metrics:
      prefix: "perfornium."
      tags:
        - "test:{{test_name}}"
        - "env:{{env.ENVIRONMENT}}"
        - "team:performance"
    
    events:
      test_start: true
      test_end: true
      sla_violations: true
    
    dashboards:
      auto_create: true
      template: "performance-testing"
```

## CI/CD Integrations

### GitHub Actions

```yaml
# .github/workflows/performance.yml
name: Performance Tests
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  performance:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Run Performance Test
        uses: perfornium/github-action@v1
        with:
          config: perfornium.yml
          output-format: junit
        env:
          API_URL: ${{ secrets.API_URL }}
          API_KEY: ${{ secrets.API_KEY }}
      
      - name: Upload Results
        uses: actions/upload-artifact@v3
        if: always()
        with:
          name: performance-results
          path: results/
```

```yaml
# perfornium.yml - GitHub Actions integration
outputs:
  github:
    enabled: true
    integration: "actions"
    
    pr_comments:
      enabled: true
      template: |
        ## Performance Test Results
        
        **Duration:** {{duration}}
        **Virtual Users:** {{virtual_users}}
        
        ### Key Metrics
        - Response Time P95: {{metrics.response_time_p95}}ms
        - Throughput: {{metrics.throughput}} req/s
        - Error Rate: {{metrics.error_rate}}%
        
        {{#if sla_violations}}
        ### ⚠️ SLA Violations
        {{#each sla_violations}}
        - {{this.metric}}: {{this.actual}} (threshold: {{this.threshold}})
        {{/each}}
        {{/if}}
    
    checks:
      enabled: true
      name: "Performance Test"
      conclusion: "{{sla_passed ? 'success' : 'failure'}}"
```

### Jenkins Integration

```yaml
outputs:
  jenkins:
    enabled: true
    webhook: "{{env.JENKINS_WEBHOOK}}"
    
    build_status:
      pass_threshold:
        response_time_p95: 1000
        error_rate: 1
      fail_threshold:
        response_time_p95: 2000
        error_rate: 5
    
    artifacts:
      - "results/report.html"
      - "results/metrics.json"
    
    junit_report: "results/junit.xml"
```

### GitLab CI Integration

```yaml
# .gitlab-ci.yml
performance_test:
  stage: test
  image: perfornium/runner:latest
  script:
    - perfornium run --config perfornium.yml --output junit
  artifacts:
    reports:
      junit: results/junit.xml
      performance: results/performance.json
    paths:
      - results/
  only:
    - main
    - merge_requests
```

## Notification Services

### Slack Integration

<!-- tabs:start -->

#### **YAML**
```yaml
outputs:
  slack:
    enabled: true
    webhook: "{{env.SLACK_WEBHOOK}}"
    channel: "#performance"

    notifications:
      test_start:
        enabled: true
        message: "🚀 Performance test started: {{test_name}}"

      test_complete:
        enabled: true
        template: |
          {{#if sla_passed}}✅{{else}}❌{{/if}} Performance test completed

          **Test:** {{test_name}}
          **Duration:** {{duration}}
          **Results:**
          • Response Time P95: {{metrics.response_time_p95}}ms
          • Throughput: {{metrics.throughput}} req/s
          • Error Rate: {{metrics.error_rate}}%

          <{{report_url}}|View Full Report>

      sla_violations:
        enabled: true
        message: "⚠️ SLA violation detected in {{test_name}}: {{violation_details}}"

    thread_replies: true
    user_mentions:
      - "@performance-team"
      - "@on-call"
```

#### **TypeScript**
```typescript
import { test } from '@testsmith/perfornium/dsl';

test('Load Test')
  .withSlack({
    webhook: process.env.SLACK_WEBHOOK,
    channel: '#performance',
    notifications: {
      test_start: {
        enabled: true,
        message: '🚀 Performance test started: {{test_name}}'
      },
      test_complete: {
        enabled: true,
        template: `
          {{#if sla_passed}}✅{{else}}❌{{/if}} Performance test completed

          **Test:** {{test_name}}
          **Duration:** {{duration}}
          **Results:**
          • Response Time P95: {{metrics.response_time_p95}}ms
          • Throughput: {{metrics.throughput}} req/s
          • Error Rate: {{metrics.error_rate}}%

          <{{report_url}}|View Full Report>
        `
      },
      sla_violations: {
        enabled: true,
        message: '⚠️ SLA violation detected in {{test_name}}: {{violation_details}}'
      }
    },
    thread_replies: true,
    user_mentions: ['@performance-team', '@on-call']
  })
  .run();
```

<!-- tabs:end -->

### Microsoft Teams

```yaml
outputs:
  teams:
    enabled: true
    webhook: "{{env.TEAMS_WEBHOOK}}"
    
    cards:
      test_results:
        type: "adaptive"
        template: |
          {
            "type": "AdaptiveCard",
            "version": "1.3",
            "body": [
              {
                "type": "TextBlock",
                "text": "Performance Test Results",
                "weight": "Bolder",
                "size": "Medium"
              },
              {
                "type": "FactSet",
                "facts": [
                  {"title": "Test Name", "value": "{{test_name}}"},
                  {"title": "Duration", "value": "{{duration}}"},
                  {"title": "Response Time P95", "value": "{{metrics.response_time_p95}}ms"},
                  {"title": "Throughput", "value": "{{metrics.throughput}} req/s"},
                  {"title": "Error Rate", "value": "{{metrics.error_rate}}%"}
                ]
              }
            ],
            "actions": [
              {
                "type": "Action.OpenUrl",
                "title": "View Report",
                "url": "{{report_url}}"
              }
            ]
          }
```

### Email Notifications

```yaml
outputs:
  email:
    enabled: true
    smtp:
      host: "smtp.company.com"
      port: 587
      username: "{{env.SMTP_USER}}"
      password: "{{env.SMTP_PASSWORD}}"
      tls: true
    
    recipients:
      - type: "to"
        addresses: ["performance-team@company.com"]
      - type: "cc"
        addresses: ["management@company.com"]
        conditions:
          - sla_violations: true
    
    templates:
      subject: "Performance Test Results - {{test_name}} - {{status}}"
      html_body: "./templates/email-report.html"
      attachments:
        - "results/report.html"
        - "results/summary.pdf"
```

## Incident Management

### PagerDuty Integration

```yaml
outputs:
  pagerduty:
    enabled: true
    integration_key: "{{env.PAGERDUTY_INTEGRATION_KEY}}"
    
    triggers:
      - name: "High Error Rate"
        condition: "error_rate > 10"
        severity: "critical"
        summary: "Performance test shows {{error_rate}}% error rate"
        
      - name: "Performance Degradation"
        condition: "response_time_p95 > 2000"
        severity: "warning"
        summary: "Response time P95 is {{response_time_p95}}ms"
    
    dedup_key: "perfornium-{{test_name}}-{{date}}"
    custom_details:
      test_config: "{{test_config}}"
      metrics_summary: "{{metrics}}"
```

### Jira Integration

```yaml
outputs:
  jira:
    enabled: true
    url: "https://company.atlassian.net"
    username: "{{env.JIRA_USER}}"
    api_token: "{{env.JIRA_TOKEN}}"
    
    issue_creation:
      enabled: true
      project: "PERF"
      issue_type: "Bug"
      
      conditions:
        - sla_violations: true
        - error_rate: "> 5"
      
      template:
        summary: "Performance degradation detected in {{test_name}}"
        description: |
          Performance test results indicate issues:
          
          h3. Test Details
          * Test Name: {{test_name}}
          * Duration: {{duration}}
          * Environment: {{environment}}
          
          h3. Metrics
          * Response Time P95: {{metrics.response_time_p95}}ms
          * Throughput: {{metrics.throughput}} req/s
          * Error Rate: {{metrics.error_rate}}%
          
          h3. SLA Violations
          {{#each sla_violations}}
          * {{this.metric}}: {{this.actual}} (threshold: {{this.threshold}})
          {{/each}}
          
          [View Full Report|{{report_url}}]
        
        labels: ["performance", "automated"]
        assignee: "performance-team"
```

## Data Platforms

### Elasticsearch Integration

```yaml
outputs:
  elasticsearch:
    enabled: true
    hosts: ["http://elasticsearch:9200"]
    index: "perfornium-metrics-{{date.YYYY.MM}}"
    
    authentication:
      username: "{{env.ELASTIC_USER}}"
      password: "{{env.ELASTIC_PASSWORD}}"
    
    mappings:
      timestamp: "date"
      test_name: "keyword"
      metric_name: "keyword"
      metric_value: "double"
      tags: "object"
    
    bulk_size: 1000
    flush_interval: 30s
```

### Amazon CloudWatch

```yaml
outputs:
  cloudwatch:
    enabled: true
    region: "us-west-2"
    namespace: "Perfornium/LoadTesting"
    
    credentials:
      access_key: "{{env.AWS_ACCESS_KEY_ID}}"
      secret_key: "{{env.AWS_SECRET_ACCESS_KEY}}"
    
    metrics:
      - name: "ResponseTime"
        unit: "Milliseconds"
        dimensions:
          TestName: "{{test_name}}"
          Environment: "{{environment}}"
      
      - name: "Throughput"
        unit: "Count/Second"
        dimensions:
          TestName: "{{test_name}}"
    
    alarms:
      - name: "HighResponseTime"
        metric: "ResponseTime"
        statistic: "Average"
        threshold: 1000
        comparison: "GreaterThanThreshold"
        evaluation_periods: 2
```

### Google Cloud Monitoring

```yaml
outputs:
  gcp_monitoring:
    enabled: true
    project_id: "{{env.GCP_PROJECT_ID}}"
    credentials_file: "{{env.GOOGLE_APPLICATION_CREDENTIALS}}"
    
    metric_descriptors:
      - type: "custom.googleapis.com/perfornium/response_time"
        display_name: "Response Time"
        metric_kind: "GAUGE"
        value_type: "DOUBLE"
        unit: "ms"
      
      - type: "custom.googleapis.com/perfornium/throughput"
        display_name: "Throughput"
        metric_kind: "GAUGE"
        value_type: "DOUBLE"
        unit: "1/s"
    
    labels:
      test_name: "{{test_name}}"
      environment: "{{env.ENVIRONMENT}}"
```

## Custom Webhooks

### Generic Webhook

<!-- tabs:start -->

#### **YAML**
```yaml
outputs:
  webhook:
    enabled: true
    url: "https://api.company.com/performance-results"
    method: "POST"

    headers:
      Authorization: "Bearer {{env.API_TOKEN}}"
      Content-Type: "application/json"
      X-Test-ID: "{{test_id}}"

    payload:
      test_name: "{{test_name}}"
      timestamp: "{{timestamp}}"
      duration: "{{duration}}"
      metrics: "{{metrics}}"
      sla_status: "{{sla_passed}}"

    retry:
      attempts: 3
      backoff: "exponential"
      delay: 1000
```

#### **TypeScript**
```typescript
import { test } from '@testsmith/perfornium/dsl';

test('Load Test')
  .withWebhook({
    url: 'https://api.company.com/performance-results',
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.API_TOKEN}`,
      'Content-Type': 'application/json',
      'X-Test-ID': '{{test_id}}'
    },
    payload: {
      test_name: '{{test_name}}',
      timestamp: '{{timestamp}}',
      duration: '{{duration}}',
      metrics: '{{metrics}}',
      sla_status: '{{sla_passed}}'
    },
    retry: {
      attempts: 3,
      backoff: 'exponential',
      delay: 1000
    }
  })
  .run();
```

<!-- tabs:end -->

### Multiple Webhooks

<!-- tabs:start -->

#### **YAML**
```yaml
outputs:
  webhooks:
    - name: "test_start"
      url: "https://api.company.com/tests/start"
      trigger: "start"
      payload:
        event: "test_started"
        test: "{{test_config}}"

    - name: "test_complete"
      url: "https://api.company.com/tests/complete"
      trigger: "complete"
      payload:
        event: "test_completed"
        results: "{{results}}"

    - name: "alerts"
      url: "https://alerts.company.com/webhook"
      trigger: "sla_violation"
      payload:
        alert_type: "sla_violation"
        details: "{{violation_details}}"
```

#### **TypeScript**
```typescript
import { test } from '@testsmith/perfornium/dsl';

test('Load Test')
  .withWebhook({
    name: 'test_start',
    url: 'https://api.company.com/tests/start',
    trigger: 'start',
    payload: {
      event: 'test_started',
      test: '{{test_config}}'
    }
  })
  .withWebhook({
    name: 'test_complete',
    url: 'https://api.company.com/tests/complete',
    trigger: 'complete',
    payload: {
      event: 'test_completed',
      results: '{{results}}'
    }
  })
  .withWebhook({
    name: 'alerts',
    url: 'https://alerts.company.com/webhook',
    trigger: 'sla_violation',
    payload: {
      alert_type: 'sla_violation',
      details: '{{violation_details}}'
    }
  })
  .run();
```

<!-- tabs:end -->

## Database Integrations

### PostgreSQL

```yaml
outputs:
  postgresql:
    enabled: true
    connection:
      host: "postgres.company.com"
      port: 5432
      database: "performance_metrics"
      username: "{{env.PG_USER}}"
      password: "{{env.PG_PASSWORD}}"
    
    tables:
      test_results:
        schema: |
          CREATE TABLE IF NOT EXISTS test_results (
            id SERIAL PRIMARY KEY,
            test_name VARCHAR(255),
            timestamp TIMESTAMP,
            duration INTEGER,
            virtual_users INTEGER,
            response_time_avg FLOAT,
            response_time_p95 FLOAT,
            throughput FLOAT,
            error_rate FLOAT,
            metadata JSONB
          );
        
        insert_query: |
          INSERT INTO test_results (
            test_name, timestamp, duration, virtual_users,
            response_time_avg, response_time_p95, throughput, error_rate, metadata
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
```

### MongoDB

```yaml
outputs:
  mongodb:
    enabled: true
    connection:
      uri: "{{env.MONGODB_URI}}"
      database: "performance_data"
    
    collections:
      test_results:
        name: "test_results"
        schema_validation: true
        schema:
          type: "object"
          required: ["test_name", "timestamp", "metrics"]
          properties:
            test_name: { type: "string" }
            timestamp: { type: "date" }
            metrics: { type: "object" }
            tags: { type: "array" }
    
    indexes:
      - collection: "test_results"
        keys: { test_name: 1, timestamp: -1 }
        options: { background: true }
```

## Integration Best Practices

### Error Handling

```yaml
integrations:
  error_handling:
    retry_policy:
      max_attempts: 3
      backoff_strategy: "exponential"
      initial_delay: 1000
      max_delay: 30000
    
    fallback:
      enabled: true
      local_storage: true
      retry_later: true
    
    timeout: 30000  # 30 seconds
```

### Security

```yaml
integrations:
  security:
    encryption:
      enabled: true
      algorithm: "AES-256-GCM"
    
    credential_management:
      use_env_vars: true
      rotate_tokens: true
      audit_access: true
    
    network:
      verify_ssl: true
      allowed_hosts:
        - "*.company.com"
        - "monitoring.example.com"
```

### Performance

```yaml
integrations:
  performance:
    async: true
    batch_processing: true
    compression: "gzip"
    connection_pooling:
      enabled: true
      max_connections: 10
      idle_timeout: 300000
```

External integrations make Perfornium a powerful part of your performance monitoring and CI/CD ecosystem, enabling automated workflows, comprehensive monitoring, and seamless team collaboration.