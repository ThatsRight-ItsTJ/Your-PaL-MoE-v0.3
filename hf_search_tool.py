#!/usr/bin/env python3
# scripts/hf_search_tool.py

import argparse
import sys
from typing import List, Dict, Optional, Union
import logging

try:
    from huggingface_hub import list_models, HfApi
except ImportError:
    print("❌ Please install: pip install huggingface_hub")
    sys.exit(1)

logging.basicConfig(level=logging.INFO, format='%(levelname)s: %(message)s')
logger = logging.getLogger(__name__)

class HuggingFaceSearch:
    """Search Hugging Face models without downloading everything"""
    
    def __init__(self):
        self.api = HfApi()
    
    def search(self, 
               query: Optional[str] = None,
               task: Optional[str] = None,
               organization: Optional[str] = None,
               library: Optional[str] = None,
               sort: str = "downloads",
               direction: int = -1,
               limit: int = 50,
               min_downloads: int = 0,
               created_after: Optional[str] = None) -> List[Dict]:
        """
        Search Hugging Face models with filters
        
        Args:
            query: Search term in model name/description
            task: Specific task (e.g., 'text-generation', 'image-classification')
            organization: Organization name (e.g., 'microsoft', 'google')  
            library: Library name (e.g., 'transformers', 'diffusers')
            sort: Sort by 'downloads', 'likes', 'created', 'modified'
            direction: -1 for descending, 1 for ascending
            limit: Maximum number of results
            min_downloads: Minimum download count
            created_after: Date filter (e.g., '2023-01-01')
        
        Returns:
            List of model dictionaries in format: {model_name, task, organization_url}
        """
        
        # Build search parameters
        search_params = {
            'sort': sort,
            'direction': direction,
            'limit': limit,
            'full': True
        }
        
        # Add filters
        if task:
            search_params['task'] = task
        if organization:
            search_params['author'] = organization
        if library:
            search_params['library'] = library
        if query:
            search_params['search'] = query
        if created_after:
            search_params['created_at'] = created_after
        
        logger.info(f"🔍 Searching models with: {search_params}")
        
        try:
            models = list_models(**search_params)
            results = []
            
            for model in models:
                try:
                    model_data = self._format_model(model)
                    if model_data:
                        # Apply download filter
                        if model_data['downloads'] >= min_downloads:
                            results.append(model_data)
                        
                        # Apply text query filter if needed (HF search isn't perfect)
                        if query and query.lower() not in model_data['model_name'].lower():
                            if query.lower() not in model_data['full_model_id'].lower():
                                continue
                
                except Exception as e:
                    logger.warning(f"Error processing model: {e}")
                    continue
            
            logger.info(f"✅ Found {len(results)} models matching criteria")
            return results
            
        except Exception as e:
            logger.error(f"❌ Search failed: {e}")
            return []
    
    def _format_model(self, model) -> Optional[Dict]:
        """Format model into our standard format"""
        try:
            model_id = getattr(model, 'id', str(model))
            if not model_id:
                return None
            
            # Split model_id into org and name
            if '/' in model_id:
                org, model_name = model_id.split('/', 1)
                organization_url = f"huggingface.co/{org}"
            else:
                model_name = model_id
                org = "independent"
                organization_url = "huggingface.co"
            
            # Get task
            task = getattr(model, 'pipeline_tag', None) or 'other'
            
            # Get metadata
            downloads = getattr(model, 'downloads', 0) or 0
            likes = getattr(model, 'likes', 0) or 0
            
            return {
                'model_name': model_name,
                'task': task,
                'organization_url': organization_url,
                'full_model_id': model_id,
                'organization': org,
                'downloads': downloads,
                'likes': likes
            }
            
        except Exception as e:
            logger.warning(f"Error formatting model: {e}")
            return None
    
    def search_by_name(self, name: str, limit: int = 20) -> List[Dict]:
        """Search models by name"""
        return self.search(query=name, limit=limit)
    
    def search_by_task(self, task: str, limit: int = 50, popular_only: bool = True) -> List[Dict]:
        """Search models by task type"""
        min_downloads = 1000 if popular_only else 0
        return self.search(task=task, limit=limit, min_downloads=min_downloads)
    
    def search_by_org(self, org: str, limit: int = 50) -> List[Dict]:
        """Search models by organization"""
        return self.search(organization=org, limit=limit)
    
    def get_popular(self, task: Optional[str] = None, limit: int = 50) -> List[Dict]:
        """Get most popular models"""
        return self.search(task=task, limit=limit, sort="downloads", min_downloads=10000)
    
    def get_recent(self, task: Optional[str] = None, limit: int = 50) -> List[Dict]:
        """Get recently created models"""
        return self.search(task=task, limit=limit, sort="created", created_after="2024-01-01")
    
    def print_results(self, results: List[Dict], show_downloads: bool = True):
        """Print search results in a nice format"""
        if not results:
            print("❌ No models found matching your criteria")
            return
        
        print(f"\n🔍 Found {len(results)} models:")
        print("-" * 100)
        
        for i, model in enumerate(results, 1):
            downloads_str = f"({model['downloads']:,} downloads)" if show_downloads else ""
            print(f"{i:2d}. {model['model_name']:<40} | {model['task']:<25} | {model['organization_url']} {downloads_str}")
    
    def export_csv(self, results: List[Dict], filename: str):
        """Export results to CSV"""
        if not results:
            print("❌ No results to export")
            return
        
        import csv
        from pathlib import Path
        
        Path(filename).parent.mkdir(parents=True, exist_ok=True)
        
        with open(filename, 'w', newline='', encoding='utf-8') as f:
            writer = csv.writer(f)
            writer.writerow(['model_name', 'task', 'organization_url'])
            
            for model in results:
                writer.writerow([
                    model['model_name'],
                    model['task'],
                    model['organization_url']
                ])
        
        print(f"💾 Exported {len(results)} models to: {filename}")

def main():
    """Command line interface"""
    parser = argparse.ArgumentParser(
        description="Search Hugging Face models without downloading everything",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  %(prog)s --name "GPT"                          # Search for GPT models
  %(prog)s --task text-generation --limit 20    # Get text generation models
  %(prog)s --org microsoft                       # Get Microsoft models
  %(prog)s --popular --task image-classification # Popular image models
  %(prog)s --recent --limit 10                   # Recent models
        """
    )
    
    # Search options
    parser.add_argument('--name', help='Search by model name')
    parser.add_argument('--task', help='Filter by task (text-generation, image-classification, etc.)')
    parser.add_argument('--org', '--organization', help='Filter by organization')
    parser.add_argument('--library', help='Filter by library (transformers, diffusers, etc.)')
    
    # Result options
    parser.add_argument('--limit', type=int, default=50, help='Maximum number of results (default: 50)')
    parser.add_argument('--min-downloads', type=int, default=0, help='Minimum download count')
    parser.add_argument('--popular', action='store_true', help='Only popular models (10k+ downloads)')
    parser.add_argument('--recent', action='store_true', help='Recent models (2024+)')
    
    # Sorting
    parser.add_argument('--sort', choices=['downloads', 'likes', 'created', 'modified'], 
                       default='downloads', help='Sort by (default: downloads)')
    parser.add_argument('--asc', action='store_true', help='Sort ascending (default: descending)')
    
    # Output
    parser.add_argument('--csv', help='Export results to CSV file')
    parser.add_argument('--no-downloads', action='store_true', help="Don't show download counts")
    
    args = parser.parse_args()
    
    # Create searcher
    searcher = HuggingFaceSearch()
    
    # Determine search parameters
    min_downloads = args.min_downloads
    if args.popular:
        min_downloads = max(min_downloads, 10000)
    
    created_after = "2024-01-01" if args.recent else None
    direction = 1 if args.asc else -1
    
    # Perform search
    results = searcher.search(
        query=args.name,
        task=args.task,
        organization=args.org,
        library=args.library,
        sort=args.sort,
        direction=direction,
        limit=args.limit,
        min_downloads=min_downloads,
        created_after=created_after
    )
    
    # Display results
    searcher.print_results(results, show_downloads=not args.no_downloads)
    
    # Export if requested
    if args.csv:
        searcher.export_csv(results, args.csv)

# Interactive mode for when script is run without arguments
def interactive_mode():
    """Interactive search mode"""
    searcher = HuggingFaceSearch()
    
    print("🔍 Hugging Face Model Search Tool")
    print("=" * 50)
    print("Commands:")
    print("  search <name>     - Search by model name")
    print("  task <task>       - Search by task type")
    print("  org <org>         - Search by organization")
    print("  popular [task]    - Get popular models")
    print("  recent [task]     - Get recent models")
    print("  help             - Show this help")
    print("  quit             - Exit")
    print()
    
    while True:
        try:
            command = input("🔍 > ").strip()
            
            if not command or command.lower() in ['quit', 'exit', 'q']:
                break
            elif command.lower() in ['help', 'h']:
                print("\nAvailable commands:")
                print("  search bert       # Search for BERT models")
                print("  task text-generation  # Get text generation models")
                print("  org microsoft     # Get Microsoft models")
                print("  popular           # Most downloaded models")
                print("  recent            # Recent models")
                continue
            
            parts = command.split()
            if len(parts) == 0:
                continue
            
            cmd = parts[0].lower()
            arg = parts[1] if len(parts) > 1 else None
            
            if cmd == 'search' and arg:
                results = searcher.search_by_name(arg)
            elif cmd == 'task' and arg:
                results = searcher.search_by_task(arg)
            elif cmd == 'org' and arg:
                results = searcher.search_by_org(arg)
            elif cmd == 'popular':
                results = searcher.get_popular(task=arg)
            elif cmd == 'recent':
                results = searcher.get_recent(task=arg)
            else:
                print("❌ Unknown command. Type 'help' for available commands.")
                continue
            
            searcher.print_results(results)
            
            # Ask if user wants to export
            if results:
                export = input("\n💾 Export to CSV? [y/N]: ").lower().strip()
                if export in ['y', 'yes']:
                    filename = f"hf_search_results_{cmd}_{arg or 'all'}.csv"
                    searcher.export_csv(results, filename)
            
            print()  # Empty line for readability
            
        except KeyboardInterrupt:
            print("\n👋 Goodbye!")
            break
        except Exception as e:
            print(f"❌ Error: {e}")

if __name__ == "__main__":
    if len(sys.argv) == 1:
        # No arguments - run interactive mode
        interactive_mode()
    else:
        # Arguments provided - run CLI mode
        main()
