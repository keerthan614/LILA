import os
import json
import glob
import pandas as pd
import pyarrow.parquet as pq

# Map Configuration
MAP_CONFIGS = {
    'AmbroseValley': {'scale': 900, 'origin_x': -370, 'origin_z': -473},
    'GrandRift': {'scale': 581, 'origin_x': -290, 'origin_z': -290},
    'Lockdown': {'scale': 1000, 'origin_x': -500, 'origin_z': -500}
}

DATA_DIR = '../player_data'
OUT_DIR = '../app/public/data'

def world_to_pixel(x, z, map_id):
    if map_id not in MAP_CONFIGS:
        return 0, 0
    
    config = MAP_CONFIGS[map_id]
    u = (x - config['origin_x']) / config['scale']
    v = (z - config['origin_z']) / config['scale']
    
    pixel_x = u * 1024
    pixel_y = (1 - v) * 1024
    
    return round(pixel_x, 1), round(pixel_y, 1)

def is_human(user_id):
    # UUIDs are human, short numeric are bots
    return '-' in str(user_id)

def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    
    print("Finding parquet files...")
    # Find all data files
    files = glob.glob(f"{DATA_DIR}/February_*/*.nakama-0")
    print(f"Found {len(files)} files.")
    
    # We will aggregate data by match_id
    matches = {}
    
    # Also track some overall stats for an index
    index_data = {
        'maps': list(MAP_CONFIGS.keys()),
        'dates': ['February_10', 'February_11', 'February_12', 'February_13', 'February_14'],
        'matches': []
    }
    
    processed_count = 0
    for f in files:
        # Extract date from path
        parts = f.split('/')
        date_folder = parts[-2]
        
        try:
            table = pq.read_table(f)
            df = table.to_pandas()
            
            if len(df) == 0:
                continue
                
            # Decode event
            df['event'] = df['event'].apply(lambda x: x.decode('utf-8') if isinstance(x, bytes) else x)
            
            match_id = df['match_id'].iloc[0]
            map_id = df['map_id'].iloc[0]
            user_id = df['user_id'].iloc[0]
            is_h = is_human(user_id)
            
            if match_id not in matches:
                matches[match_id] = {
                    'match_id': match_id,
                    'map_id': map_id,
                    'date': date_folder,
                    'players': {}
                }
            
            # Convert coordinates
            # Vectorized implementation for speed
            config = MAP_CONFIGS.get(map_id, MAP_CONFIGS['AmbroseValley'])
            df['u'] = (df['x'] - config['origin_x']) / config['scale']
            df['v'] = (df['z'] - config['origin_z']) / config['scale']
            df['px'] = (df['u'] * 1024).round(1)
            df['py'] = ((1 - df['v']) * 1024).round(1)
            
            # Sort by time
            df = df.sort_values('ts')
            
            # Convert timestamp to relative ms from match start
            # We'll normalize this later per match
            
            player_events = []
            for _, row in df.iterrows():
                player_events.append({
                    'ts': int(row['ts'].timestamp() * 1000), # Unix ms
                    'x': row['px'],
                    'y': row['py'],
                    'e': row['event']
                })
                
            matches[match_id]['players'][user_id] = {
                'is_human': is_h,
                'events': player_events
            }
            
        except Exception as e:
            print(f"Error processing {f}: {e}")
            
        processed_count += 1
        if processed_count % 100 == 0:
            print(f"Processed {processed_count}/{len(files)}")
            
    print("Normalizing timestamps and writing match files...")
    
    for match_id, data in matches.items():
        # Find global min ts for this match
        min_ts = float('inf')
        max_ts = 0
        human_count = 0
        bot_count = 0
        
        for uid, pdata in data['players'].items():
            if pdata['is_human']:
                human_count += 1
            else:
                bot_count += 1
                
            if len(pdata['events']) > 0:
                min_ts = min(min_ts, pdata['events'][0]['ts'])
                max_ts = max(max_ts, pdata['events'][-1]['ts'])
                
        # Normalize timestamps to start at 0
        if min_ts != float('inf'):
            for uid, pdata in data['players'].items():
                for e in pdata['events']:
                    e['ts'] = e['ts'] - min_ts
                    
            duration_ms = max_ts - min_ts
        else:
            duration_ms = 0
            
        # Add to index
        index_data['matches'].append({
            'id': match_id,
            'map': data['map_id'],
            'date': data['date'],
            'humans': human_count,
            'bots': bot_count,
            'duration_ms': duration_ms
        })
        
        # Write match file
        match_file = os.path.join(OUT_DIR, f"{match_id}.json")
        with open(match_file, 'w') as f:
            json.dump(data, f)
            
    # Write index file
    print("Writing index file...")
    with open(os.path.join(OUT_DIR, 'index.json'), 'w') as f:
        json.dump(index_data, f)
        
    print(f"Done. Processed {processed_count} files into {len(matches)} matches.")

if __name__ == "__main__":
    main()
