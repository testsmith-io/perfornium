# HTML Reports

Perfornium generates comprehensive HTML reports that provide interactive visualizations, detailed analysis, and actionable insights from your performance tests. These reports are designed for sharing with stakeholders and in-depth performance analysis.

## Overview

HTML reports include:
- Interactive charts and graphs
- Detailed metrics breakdown
- Error analysis and debugging
- Performance trends and comparisons
- Export capabilities
- Responsive design for all devices

## Basic Configuration

### Enable HTML Reports

<!-- tabs:start -->

#### **YAML**
```yaml
outputs:
  html:
    enabled: true
    file: "report.html"
    template: "default"
    open_browser: true
```

#### **TypeScript**
```typescript
import { test } from '@testsmith/perfornium/dsl';

test('Load Test')
  .withReport('report.html', {
    template: 'default',
    open_browser: true
  })
  .run();
```

<!-- tabs:end -->

### Advanced Configuration

<!-- tabs:start -->

#### **YAML**
```yaml
outputs:
  html:
    enabled: true
    file: './reports/performance-report.html'
    template: 'detailed'
    options:
      includeRawData: true
      embedAssets: true
```

#### **TypeScript**
```typescript
import { test } from '@testsmith/perfornium/dsl';

test('Load Test')
  .withReport('./reports/performance-report.html', {
    template: 'detailed',
    options: {
      includeRawData: true,
      embedAssets: true
    }
  })
  .run();
```

<!-- tabs:end -->

## Report Templates

### Default Template

<!-- tabs:start -->

#### **YAML**
```yaml
outputs:
  html:
    template: "default"
    sections:
      - summary
      - charts
      - metrics
      - errors
      - requests
```

#### **TypeScript**
```typescript
import { test } from '@testsmith/perfornium/dsl';

test('Load Test')
  .withReport('report.html', {
    template: 'default',
    sections: [
      'summary',
      'charts',
      'metrics',
      'errors',
      'requests'
    ]
  })
  .run();
```

<!-- tabs:end -->

### Detailed Template

<!-- tabs:start -->

#### **YAML**
```yaml
outputs:
  html:
    template: "detailed"
    sections:
      - executive_summary
      - test_configuration
      - performance_overview
      - response_time_analysis
      - throughput_analysis
      - error_analysis
      - virtual_user_analysis
      - resource_utilization
      - network_analysis
      - recommendations
      - raw_data
```

#### **TypeScript**
```typescript
import { test } from '@testsmith/perfornium/dsl';

test('Load Test')
  .withReport('report.html', {
    template: 'detailed',
    sections: [
      'executive_summary',
      'test_configuration',
      'performance_overview',
      'response_time_analysis',
      'throughput_analysis',
      'error_analysis',
      'virtual_user_analysis',
      'resource_utilization',
      'network_analysis',
      'recommendations',
      'raw_data'
    ]
  })
  .run();
```

<!-- tabs:end -->

### Executive Template

<!-- tabs:start -->

#### **YAML**
```yaml
outputs:
  html:
    template: "executive"
    focus: "business_metrics"
    sections:
      - key_performance_indicators
      - sla_compliance
      - user_experience_metrics
      - business_impact
      - recommendations

    customization:
      logo: "./company-logo.png"
      colors:
        primary: "#1E40AF"
        secondary: "#64748B"
      branding: "Company Performance Report"
```

#### **TypeScript**
```typescript
import { test } from '@testsmith/perfornium/dsl';

test('Load Test')
  .withReport('report.html', {
    template: 'executive',
    focus: 'business_metrics',
    sections: [
      'key_performance_indicators',
      'sla_compliance',
      'user_experience_metrics',
      'business_impact',
      'recommendations'
    ],
    customization: {
      logo: './company-logo.png',
      colors: {
        primary: '#1E40AF',
        secondary: '#64748B'
      },
      branding: 'Company Performance Report'
    }
  })
  .run();
```

<!-- tabs:end -->

## Customization Options

### Visual Customization

```yaml
outputs:
  html:
    customization:
      title: "API Performance Test Report"
      subtitle: "Production Load Test - {{test_date}}"
      
      branding:
        logo: "./assets/logo.png"
        company: "Acme Corporation"
        footer: "Confidential - Internal Use Only"
      
      theme:
        primary_color: "#2563EB"
        secondary_color: "#64748B"
        accent_color: "#10B981"
        background: "#FFFFFF"
        text_color: "#1F2937"
      
      fonts:
        heading: "Inter"
        body: "Inter"
        code: "JetBrains Mono"
```

### Section Configuration

```yaml
outputs:
  html:
    sections:
      summary:
        enabled: true
        position: 1
        title: "Test Summary"
        widgets:
          - kpi_cards
          - test_status
          - duration_info
      
      charts:
        enabled: true
        position: 2
        title: "Performance Charts"
        charts:
          - response_times
          - throughput
          - virtual_users
          - error_rate
        
        options:
          interactive: true
          zoom: true
          export: true
      
      metrics:
        enabled: true
        position: 3
        breakdown: "detailed"
        percentiles: [50, 75, 90, 95, 99]
```

## Interactive Features

### Chart Interactions

```yaml
outputs:
  html:
    charts:
      interactive: true
      features:
        - zoom_and_pan
        - tooltip_details
        - legend_toggle
        - data_export
        - fullscreen_view
      
      response_times:
        type: "line"
        show_percentiles: true
        show_average: true
        annotations:
          - type: "threshold"
            value: 1000
            label: "SLA Threshold"
      
      throughput:
        type: "area"
        stacked: false
        show_target: true
        target_value: 1000  # requests/second
```

### Data Exploration

```yaml
outputs:
  html:
    exploration:
      data_table: true
      search: true
      filtering: true
      sorting: true
      
      filters:
        - name: "Time Range"
          type: "datetime"
        - name: "Request Type"
          type: "select"
        - name: "Response Time"
          type: "range"
        - name: "Status Code"
          type: "checkbox"
```

## Advanced Report Features

### Comparative Analysis

```yaml
outputs:
  html:
    comparison:
      enabled: true
      baseline: "previous_test"
      show_differences: true
      highlight_degradation: true
      
      metrics:
        - response_time_p95
        - throughput
        - error_rate
        - resource_usage
      
      thresholds:
        improvement: 5    # % improvement to highlight
        degradation: 10   # % degradation to flag
```

### Trend Analysis

```yaml
outputs:
  html:
    trends:
      enabled: true
      historical_data: "./test-history"
      period: "30d"
      
      trend_metrics:
        - response_times
        - error_rates
        - throughput
      
      forecasting:
        enabled: true
        algorithm: "linear_regression"
        confidence_interval: 0.95
```

### SLA Monitoring

```yaml
outputs:
  html:
    sla:
      enabled: true
      thresholds:
        response_time_p95: 1000  # ms
        response_time_p99: 2000  # ms
        error_rate: 1            # %
        availability: 99.9       # %
      
      compliance_chart: true
      violation_details: true
      recommendations: true
```

## Report Sections Detail

### Executive Summary

```yaml
outputs:
  html:
    sections:
      executive_summary:
        kpis:
          - name: "Average Response Time"
            value: "{{metrics.response_time_avg}}"
            unit: "ms"
            target: 500
            status: "{{metrics.response_time_avg < 500 ? 'good' : 'warning'}}"
          
          - name: "95th Percentile"
            value: "{{metrics.response_time_p95}}"
            unit: "ms"
            target: 1000
          
          - name: "Requests per Second"
            value: "{{metrics.throughput}}"
            unit: "req/s"
            target: 1000
          
          - name: "Error Rate"
            value: "{{metrics.error_rate}}"
            unit: "%"
            target: 1
            inverse: true  # Lower is better
```

### Performance Analysis

```yaml
outputs:
  html:
    sections:
      performance_analysis:
        charts:
          response_time_distribution:
            type: "histogram"
            bins: 50
            show_percentiles: true
          
          performance_over_time:
            type: "multi_line"
            metrics:
              - response_time_avg
              - response_time_p95
              - throughput
          
          load_correlation:
            type: "scatter"
            x_axis: "virtual_users"
            y_axis: "response_time_p95"
```

### Error Analysis

```yaml
outputs:
  html:
    sections:
      error_analysis:
        error_breakdown:
          by_status_code: true
          by_endpoint: true
          by_time: true
        
        error_details:
          show_stack_traces: true
          show_request_context: true
          group_similar: true
        
        error_timeline:
          chart_type: "area"
          show_error_types: true
```

## Export and Sharing

### Embedding Options

```yaml
outputs:
  html:
    embedding:
      inline_assets: true      # Embed CSS/JS
      inline_data: true        # Embed test data
      self_contained: true     # Single file report
      
      external_assets:
        enabled: false
        cdn: "https://cdn.example.com/perfornium-assets/"
```

### Export Formats

```yaml
outputs:
  html:
    export:
      pdf:
        enabled: true
        file: "report.pdf"
        options:
          format: "A4"
          orientation: "portrait"
          margin: "1cm"
      
      static_images:
        enabled: true
        directory: "./charts"
        formats: ["png", "svg"]
      
      data_export:
        csv: true
        json: true
        excel: true
```

### Sharing Features

```yaml
outputs:
  html:
    sharing:
      public_url: true
      expiration: "7d"
      password_protect: true
      
      email:
        enabled: true
        recipients:
          - "team@company.com"
          - "stakeholders@company.com"
        subject: "Performance Test Report - {{test_name}}"
        template: "default"
```

## Integration Examples

### CI/CD Integration

```yaml
# In CI pipeline
outputs:
  html:
    file: "./artifacts/performance-report-{{build_number}}.html"
    
    ci_integration:
      artifact_upload: true
      pr_comments: true
      slack_notification:
        webhook: "{{env.SLACK_WEBHOOK}}"
        channel: "#performance"
        message: "Performance test completed. Report: {{report_url}}"
```

### Monitoring Dashboards

```yaml
outputs:
  html:
    dashboard_integration:
      grafana:
        enabled: true
        iframe_url: true
        annotations: true
      
      datadog:
        enabled: true
        custom_metric_submission: true
      
      new_relic:
        enabled: true
        deployment_markers: true
```

### Report Archives

```yaml
outputs:
  html:
    archiving:
      enabled: true
      directory: "./report-archive"
      retention: "90d"
      compression: true
      
      indexing:
        create_index: true
        searchable: true
        metadata_extraction: true
```

## Custom Templates

### Template Structure

```html
<!-- custom-template.html -->
<!DOCTYPE html>
<html>
<head>
    <title>{{report.title}}</title>
    <link rel="stylesheet" href="{{template.css}}">
</head>
<body>
    <header>
        <h1>{{test.name}}</h1>
        <div class="metadata">
            <span>Duration: {{test.duration}}</span>
            <span>VUs: {{test.virtual_users}}</span>
        </div>
    </header>
    
    <main>
        {{#each sections}}
        <section class="{{this.type}}">
            <h2>{{this.title}}</h2>
            {{this.content}}
        </section>
        {{/each}}
    </main>
    
    <script src="{{template.js}}"></script>
</body>
</html>
```

### Template Configuration

```yaml
outputs:
  html:
    template: "custom"
    template_file: "./templates/custom-template.html"
    
    variables:
      company_name: "Acme Corp"
      test_environment: "Production"
      contact_email: "performance@company.com"
    
    custom_sections:
      - name: "business_impact"
        template: "./sections/business-impact.html"
        data: "{{business_metrics}}"
      
      - name: "recommendations"
        template: "./sections/recommendations.html"
        auto_generate: true
```

## Performance Recommendations

The HTML report can automatically generate performance recommendations:

```yaml
outputs:
  html:
    recommendations:
      enabled: true
      analysis_depth: "comprehensive"
      
      rule_sets:
        - "web_performance"
        - "api_performance" 
        - "scalability"
        - "reliability"
      
      custom_rules:
        - name: "High Response Time"
          condition: "response_time_p95 > 1000"
          recommendation: "Consider implementing caching or optimizing database queries"
          priority: "high"
        
        - name: "Memory Usage"
          condition: "memory_usage > 80"
          recommendation: "Monitor memory leaks and optimize memory allocation"
          priority: "medium"
```

## Best Practices

### Report Optimization

1. **Size Management**
   ```yaml
   outputs:
     html:
       optimization:
         max_data_points: 10000
         compression: "gzip"
         lazy_loading: true
         progressive_loading: true
   ```

2. **Performance**
   ```yaml
   outputs:
     html:
       performance:
         async_rendering: true
         chart_throttling: true
         data_sampling: 1000  # Sample large datasets
   ```

3. **Accessibility**
   ```yaml
   outputs:
     html:
       accessibility:
         alt_text: true
         keyboard_navigation: true
         screen_reader: true
         color_blind_friendly: true
   ```

### Team Collaboration

```yaml
outputs:
  html:
    collaboration:
      comments:
        enabled: true
        integrations: ["github", "jira"]
      
      annotations:
        allow_user_annotations: true
        highlight_issues: true
        
      version_control:
        track_changes: true
        diff_view: true
```

HTML reports provide comprehensive, interactive analysis of your performance test results, making it easy to understand performance characteristics, identify issues, and share insights with your team and stakeholders.