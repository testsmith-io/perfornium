# Custom Patterns

Custom load patterns in Perfornium allow you to create sophisticated, tailored load testing scenarios that match your specific requirements. These patterns go beyond standard ramp-up and constant load approaches to simulate complex real-world traffic patterns.

## Overview

Custom patterns enable:
- Complex multi-phase load profiles
- Dynamic load adjustment based on metrics
- Time-based pattern variations
- Business-specific load modeling
- Event-driven traffic simulation

## Pattern Types

### Script-based Patterns

Define load patterns using JavaScript functions:

```yaml
load:
  pattern: "custom"
  custom:
    type: "script"
    script: |
      // Time in seconds, returns VU count
      function calculateLoad(time, currentLoad, metrics) {
        if (time < 300) {
          // Ramp up over 5 minutes
          return Math.floor(time / 6);  // 0 to 50 VUs
        } else if (time < 600) {
          // Steady load for 5 minutes
          return 50;
        } else if (time < 900) {
          // Peak traffic spike
          return 50 + Math.sin((time - 600) / 60) * 100;
        } else {
          // Gradual decline
          return Math.max(10, 150 - (time - 900) / 10);
        }
      }
```

### Formula-based Patterns

Use mathematical formulas to define load curves:

```yaml
load:
  pattern: "custom"
  custom:
    type: "formula"
    formula: "50 + 30 * sin(time / 120) + random(-5, 5)"
    variables:
      base_load: 50
      amplitude: 30
      period: 120  # seconds
      noise: 5
```

### Multi-phase Patterns

Define complex patterns with multiple phases:

<!-- tabs:start -->

#### **YAML**
```yaml
load:
  pattern: "custom"
  custom:
    type: "phases"
    phases:
      - name: "warmup"
        duration: "2m"
        start_vus: 0
        target_vus: 20
        curve: "linear"

      - name: "steady_load"
        duration: "5m"
        vus: 20

      - name: "spike"
        duration: "30s"
        start_vus: 20
        target_vus: 100
        curve: "exponential"

      - name: "recovery"
        duration: "2m"
        start_vus: 100
        target_vus: 20
        curve: "smooth"

      - name: "stress_test"
        duration: "3m"
        pattern: "oscillating"
        min_vus: 20
        max_vus: 80
        oscillation_period: "30s"

      - name: "cooldown"
        duration: "1m"
        start_vus: 20
        target_vus: 0
        curve: "linear"
```

#### **TypeScript**
```typescript
import { test } from '@testsmith/perfornium/dsl';

test('Multi-phase Custom Pattern')
  .baseUrl('https://api.example.com')
  .scenario('Default')
    .get('/')
  .done()
  .withLoad({
    pattern: 'custom',
    stages: [
      { name: 'warmup', duration: '2m', start_vus: 0, target_vus: 20, curve: 'linear' },
      { name: 'steady_load', duration: '5m', vus: 20 },
      { name: 'spike', duration: '30s', start_vus: 20, target_vus: 100, curve: 'exponential' },
      { name: 'recovery', duration: '2m', start_vus: 100, target_vus: 20, curve: 'smooth' },
      { name: 'stress_test', duration: '3m', pattern: 'oscillating', min_vus: 20, max_vus: 80, oscillation_period: '30s' },
      { name: 'cooldown', duration: '1m', start_vus: 20, target_vus: 0, curve: 'linear' }
    ]
  })
  .build();
```

<!-- tabs:end -->

## Dynamic Load Adjustment

### Metric-based Scaling

Adjust load based on real-time metrics:

```yaml
load:
  pattern: "custom"
  custom:
    type: "adaptive"
    base_vus: 50
    
    scaling_rules:
      - metric: "response_time_p95"
        condition: "> 1000"
        action: "decrease"
        factor: 0.8
        min_vus: 10
        
      - metric: "error_rate"
        condition: "> 5"
        action: "decrease"
        factor: 0.5
        
      - metric: "cpu_usage"
        condition: "< 70"
        action: "increase"
        factor: 1.2
        max_vus: 200
        
      - metric: "success_rate"
        condition: "> 99"
        action: "increase"
        factor: 1.1
        interval: 30  # Check every 30 seconds
```

### External Signal Integration

Scale based on external signals or APIs:

```yaml
load:
  pattern: "custom"
  custom:
    type: "external"
    endpoint: "http://monitoring.example.com/load-signal"
    interval: 10  # Check every 10 seconds
    
    mapping:
      low: 10
      medium: 50
      high: 100
      critical: 200
    
    fallback_vus: 25
```

## Time-based Patterns

### Business Hour Simulation

Simulate typical business traffic patterns:

```yaml
load:
  pattern: "custom"
  custom:
    type: "business_hours"
    timezone: "America/New_York"
    
    patterns:
      weekday:
        "00:00-08:00": 5   # Night - minimal load
        "08:00-09:00": 30  # Morning ramp
        "09:00-12:00": 50  # Morning peak
        "12:00-13:00": 75  # Lunch peak
        "13:00-17:00": 60  # Afternoon
        "17:00-18:00": 40  # Evening decline
        "18:00-24:00": 15  # Evening low
        
      weekend:
        "00:00-10:00": 3   # Late night/early morning
        "10:00-14:00": 20  # Moderate activity
        "14:00-18:00": 15  # Afternoon
        "18:00-22:00": 25  # Evening peak
        "22:00-24:00": 8   # Night
        
      holiday: 5  # Constant low load on holidays
    
    holidays:
      - "2024-01-01"  # New Year
      - "2024-07-04"  # Independence Day
      - "2024-12-25"  # Christmas
```

### Seasonal Patterns

Model seasonal traffic variations:

```yaml
load:
  pattern: "custom"
  custom:
    type: "seasonal"
    base_pattern: "business_hours"
    
    seasonal_multipliers:
      # Month-based multipliers
      january: 0.8    # Post-holiday low
      february: 0.9
      march: 1.0
      april: 1.1
      may: 1.2
      june: 1.3       # Summer peak
      july: 1.4
      august: 1.3
      september: 1.1
      october: 1.0
      november: 1.2   # Black Friday effect
      december: 1.5   # Holiday shopping
    
    # Special events
    events:
      - name: "Black Friday"
        dates: ["2024-11-29"]
        multiplier: 3.0
        duration: "24h"
        
      - name: "Cyber Monday"
        dates: ["2024-12-02"]
        multiplier: 2.5
        duration: "24h"
```

## Event-driven Patterns

### Load Bursts

Simulate sudden traffic spikes:

```yaml
load:
  pattern: "custom"
  custom:
    type: "event_driven"
    base_vus: 25
    
    events:
      - type: "burst"
        trigger: "time"
        time: "5m"
        peak_vus: 200
        duration: "2m"
        shape: "spike"  # spike, plateau, bell_curve
        
      - type: "flash_sale"
        trigger: "external"
        webhook: "http://api.example.com/flash-sale-webhook"
        peak_vus: 500
        ramp_up: "30s"
        duration: "15m"
        ramp_down: "5m"
        
      - type: "news_event"
        trigger: "manual"
        peak_vus: 300
        pattern: "viral"  # Exponential growth then decay
        growth_rate: 1.5
        decay_rate: 0.8
```

### Conditional Scaling

Scale based on application behavior:

```yaml
load:
  pattern: "custom"
  custom:
    type: "conditional"
    base_vus: 50
    
    conditions:
      - name: "high_success_rate"
        condition: "success_rate > 98 AND response_time_p95 < 500"
        action:
          increase_by: 20
          max_vus: 200
        
      - name: "performance_degradation"
        condition: "response_time_p95 > 2000 OR error_rate > 10"
        action:
          decrease_by: 30
          min_vus: 10
          pause_duration: "2m"
        
      - name: "server_overload"
        condition: "error_rate > 50"
        action:
          emergency_scale_down: 5
          pause_duration: "5m"
```

## Advanced Pattern Features

### Pattern Composition

Combine multiple patterns:

```yaml
load:
  pattern: "custom"
  custom:
    type: "composite"
    
    layers:
      - name: "base_load"
        pattern: "constant"
        vus: 20
        weight: 1.0
        
      - name: "business_hours"
        pattern: "time_based"
        config:
          peak_hours: "09:00-17:00"
          peak_multiplier: 2.0
        weight: 0.8
        
      - name: "random_noise"
        pattern: "random"
        config:
          min_factor: 0.9
          max_factor: 1.1
          change_interval: "30s"
        weight: 0.2
```

### Geographic Distribution

Simulate global user distribution:

```yaml
load:
  pattern: "custom"
  custom:
    type: "geographic"
    
    regions:
      - name: "us_east"
        vus: 40
        timezone: "America/New_York"
        peak_hours: "09:00-17:00"
        
      - name: "us_west"
        vus: 30
        timezone: "America/Los_Angeles"
        peak_hours: "09:00-17:00"
        offset: "-3h"  # 3 hours behind east coast
        
      - name: "europe"
        vus: 35
        timezone: "Europe/London"
        peak_hours: "09:00-17:00"
        
      - name: "asia_pacific"
        vus: 25
        timezone: "Asia/Tokyo"
        peak_hours: "09:00-17:00"
    
    coordination: "realistic"  # realistic, synchronized, independent
```

## Pattern Validation

### Pattern Testing

Test patterns before full execution:

```yaml
load:
  pattern: "custom"
  custom:
    # ... pattern definition ...
    
    validation:
      enabled: true
      dry_run: true
      duration: "30s"  # Quick validation run
      
      checks:
        - max_vus_per_second: 10
        - min_vus: 1
        - max_vus: 500
        - smooth_transitions: true
```

### Pattern Visualization

Generate pattern visualizations:

```yaml
outputs:
  pattern_preview:
    enabled: true
    format: "html"
    file: "pattern-preview.html"
    duration: "1h"  # Preview duration
    resolution: "10s"  # Data point interval
```

## Custom Pattern Examples

### E-commerce Traffic

<!-- tabs:start -->

#### **YAML**
```yaml
load:
  pattern: "custom"
  custom:
    type: "ecommerce"

    # Normal browsing traffic
    base_traffic:
      vus: 50
      variation: 0.2  # ±20% random variation

    # Sale events
    sales_events:
      - name: "flash_sale"
        start_time: "10:00"
        duration: "4h"
        multiplier: 4.0
        ramp_up: "15m"

    # Peak shopping hours
    daily_peaks:
      - time: "12:00-13:00"  # Lunch break
        multiplier: 1.8
      - time: "19:00-21:00"  # Evening shopping
        multiplier: 2.2

    # Weekend boost
    weekend_multiplier: 1.5
```

#### **TypeScript**
```typescript
import { test } from '@testsmith/perfornium/dsl';

test('E-commerce Traffic Pattern')
  .baseUrl('https://api.example.com')
  .scenario('Default')
    .get('/')
  .done()
  .withLoad({
    pattern: 'custom',
    stages: [
      // Base traffic with variation
      { duration: '24h', vus: 50, variation: 0.2 },
      // Flash sale spike at 10:00
      { start_time: '10:00', duration: '4h', vus: 200, ramp_up: '15m' },
      // Lunch peak
      { start_time: '12:00', duration: '1h', vus: 90 },
      // Evening shopping peak
      { start_time: '19:00', duration: '2h', vus: 110 }
    ]
  })
  .build();
```

<!-- tabs:end -->

### Social Media Pattern

```yaml
load:
  pattern: "custom"
  custom:
    type: "social_media"
    
    # Content posting patterns
    posting_waves:
      morning_wave: 
        time: "07:00-09:00"
        peak_multiplier: 2.0
      lunch_wave:
        time: "12:00-14:00"
        peak_multiplier: 1.8
      evening_wave:
        time: "18:00-22:00"
        peak_multiplier: 3.0
    
    # Viral content simulation
    viral_events:
      probability: 0.1  # 10% chance per hour
      multiplier_range: [2.0, 10.0]
      duration_range: ["30m", "6h"]
      decay_pattern: "exponential"
```

### Gaming Server Load

```yaml
load:
  pattern: "custom"
  custom:
    type: "gaming"
    
    # Player lifecycle
    session_patterns:
      - type: "casual"
        percentage: 60
        session_duration: "30m"
        peak_hours: "19:00-23:00"
        
      - type: "dedicated"
        percentage: 30
        session_duration: "3h"
        peak_hours: "20:00-02:00"
        
      - type: "hardcore"
        percentage: 10
        session_duration: "8h"
        peak_hours: "all_day"
    
    # Event-based spikes
    game_events:
      - name: "raid_time"
        schedule: "daily 20:00"
        duration: "2h"
        multiplier: 2.5
        
      - name: "tournament"
        schedule: "weekly saturday 15:00"
        duration: "4h"
        multiplier: 4.0
```

## Best Practices

### Pattern Design

1. **Start Simple**

   <!-- tabs:start -->

   #### **YAML**
   ```yaml
   # Begin with basic patterns
   load:
     pattern: "custom"
     custom:
       type: "phases"
       phases:
         - name: "ramp"
           duration: "5m"
           start_vus: 0
           target_vus: 100
         - name: "sustain"
           duration: "10m"
           vus: 100
   ```

   #### **TypeScript**
   ```typescript
   import { test } from '@testsmith/perfornium/dsl';

   // Begin with basic patterns
   test('Simple Custom Pattern')
     .baseUrl('https://api.example.com')
     .scenario('Default')
       .get('/')
     .done()
     .withLoad({
       pattern: 'custom',
       stages: [
         { name: 'ramp', duration: '5m', start_vus: 0, target_vus: 100 },
         { name: 'sustain', duration: '10m', vus: 100 }
       ]
     })
     .build();
   ```

   <!-- tabs:end -->

2. **Add Complexity Gradually**
   ```yaml
   # Then add realistic variations
   phases:
     - name: "sustain"
       duration: "10m"
       vus: 100
       variation: 0.1  # ±10% random variation
   ```

3. **Validate Assumptions**
   ```yaml
   validation:
     enabled: true
     max_concurrent_changes: 50  # Don't change more than 50 VUs at once
     change_rate_limit: 10       # Max 10 VU changes per second
   ```

### Performance Considerations

1. **Resource Planning**
   ```yaml
   custom:
     resource_limits:
       max_vus: 1000
       max_ramp_rate: 50  # VUs per second
       memory_limit: "2GB"
   ```

2. **Monitoring Integration**
   ```yaml
   custom:
     monitoring:
       pattern_metrics: true
       phase_tracking: true
       adjustment_logging: true
   ```

Custom patterns provide the flexibility to create realistic, sophisticated load testing scenarios that accurately represent your application's traffic patterns and help identify performance issues under real-world conditions.