import { Component, OnInit, AfterViewInit, OnDestroy } from '@angular/core';
import { initTextEditor } from '../../../helpers/posts.helper';
import { I18nService } from '../../../services/i18n.service';
import { SettingsService } from '../../../services/settings.service';
import { slugify } from '../../../helpers/functions.helper';
import { Language } from '../../../models/language.model';
import { CategoriesService } from '../../../services/collections/categories.service';
import { Category } from '../../../models/collections/category.model';
import { Observable, Subject } from 'rxjs';
import { map, takeUntil } from 'rxjs/operators';
import { AlertService } from '../../../services/alert.service';
import { PostsService } from '../../../services/collections/posts.service';
import { NavigationService } from '../../../services/navigation.service';
import {Post, PostStatus} from '../../../models/collections/post.model';
import { getEmptyImage } from '../../../helpers/assets.helper';
import {DndDropEvent, DropEffect} from "ngx-drag-drop";

@Component({
  selector: 'fa-posts-add',
  templateUrl: './posts-add.component.html',
  styleUrls: ['./posts-add.component.css']
})
export class PostsAddComponent implements OnInit, AfterViewInit, OnDestroy {

  title: string;
  price: string;
  editor: any;
  private status: PostStatus;
  language: string;
  languages: Language[];
  slug: string;
  date: string;
  private image: File;
  imageSrc: string|ArrayBuffer;
  private checkedCategories: string[] = [];
  categoriesObservable: Observable<Category[]>;
  newCategory: string;
  isSubmitButtonsDisabled: boolean = false;
  private languageChange: Subject<void> = new Subject<void>();
  private images: File[] = [];
  imagesSources:  any[] = [];
  readonly horizontalLayout = {
    container: "row",
    list: "row",
    dndHorizontal: true
  };
  private draggable: any;
  private galleryDeleteList: any = [];

  constructor(
    private i18n: I18nService,
    private settings: SettingsService,
    private categories: CategoriesService,
    private alert: AlertService,
    private posts: PostsService,
    private navigation: NavigationService
  ) {

    this.draggable = {
      // note that data is handled with JSON.stringify/JSON.parse
      // only set simple data or POJO's as methods will be lost
      data: "myDragData",
      effectAllowed: "all",
      disable: false,
      handle: false
    };

  }

  ngOnInit() {
    this.status = PostStatus.Draft;
    this.languages = this.settings.getActiveSupportedLanguages();
    this.language = this.languages[0].key;
    this.date = new Date().toISOString().slice(0, 10);
    this.image = null;
    this.imageSrc = getEmptyImage();
    this.setCategoriesObservable();
  }

  ngAfterViewInit() {
    this.editor = initTextEditor('#editor-container', this.i18n.get('PostContent'));
  }

  ngOnDestroy() {
    this.languageChange.next();
  }

  private setCategoriesObservable() {
    this.categoriesObservable = this.categories.getWhere('lang', '==', this.language).pipe(
      map((categories: Category[]) => {
        return categories.sort((a: Category, b: Category) => b.createdAt - a.createdAt);
      }),
      takeUntil(this.languageChange)
    );
  }

  onTitleInput() {
    this.slug = slugify(this.title).substr(0, 50);
  }

  onLanguageChange() {
    this.languageChange.next();
    this.checkedCategories = [];
    this.setCategoriesObservable();
  }

  addCategory(event: Event) {
    const target = event.target as any;
    target.disabled = true;
    this.categories.add({
      label: this.newCategory,
      slug: slugify(this.newCategory),
      lang: this.language
    }).catch((error: Error) => {
      this.alert.error(error.message);
    }).finally(() => {
      this.newCategory = '';
    });
  }

  onCategoryCheck(category: Category, event: Event|any) {
    if (event.target.checked) {
      this.checkedCategories.push(category.id);
    } else {
      const index = this.checkedCategories.indexOf(category.id);
      if (index !== -1) {
        this.checkedCategories.splice(index, 1);
      }
    }
  }

  onImageChange(event: Event) {
    this.image = (event.target as HTMLInputElement).files[0];
    const reader = new FileReader();
    reader.onload = () => {
      this.images.push(this.image);
      this.imagesSources.push({url: reader.result as string});
      this.imageSrc = reader.result;
    };
    reader.readAsDataURL(this.image);
  }

  onImageDelete(id) {
    this.galleryDeleteList.push(id);
    const index = this.imagesSources.findIndex(x => x.id == id);
    this.imagesSources.splice(index-1, 1);
    if (this.imagesSources.length == 0) {
      this.image = null;
      this.imageSrc = null;
      this.images = [];
    }
    //temp delete first and actually delete on save!
    //  this.posts.deleteImageFromGallery(this.id, id).then(() => {
    //    setTimeout(() => {this.loadGallery();}, 500);
    //  });
  }

  addPost(event: Event, status?: PostStatus) {
    const target = event.target as any;
    const startLoading = () => {
      target.isLoading = true;
      this.isSubmitButtonsDisabled = true;
    };
    const stopLoading = () => {
      target.isLoading = false;
      this.isSubmitButtonsDisabled = false;
    };
    startLoading();
    // Check if post slug is duplicated
    this.posts.isSlugDuplicated(this.slug, this.language).then((duplicated: boolean) => {
      if (duplicated) {
        // Warn user about post slug
        this.alert.warning(this.i18n.get('PostSlugAlreadyExists'), false, 5000);
        stopLoading();
      } else {
        // Add post
        if (status) {
          this.status = status;
        }
        const data: Post = {
          lang: this.language,
          title: this.title,
          price: this.price,
          slug: this.slug,
          date: new Date(this.date).getTime(),
          content: this.editor.root.innerHTML,
          status: this.status,
          categories: this.checkedCategories
        };
        if (this.images) {
          data.images = this.images;
        }
        this.posts.add(data, this.imagesSources).then(() => {
          this.alert.success(this.i18n.get('PostAdded'), false, 5000, true);
          this.navigation.redirectTo('posts', 'list');
        }).catch((error: Error) => {
          this.alert.error(error.message);
        }).finally(() => {
          stopLoading();
        });
      }
    }).catch((error: Error) => {
      this.alert.error(error.message);
      stopLoading();
    });
  }

  publishPost(event: Event) {
    this.addPost(event, PostStatus.Published);
  }

  onDrop($event: DndDropEvent, list: any) {
    console.log($event);
    if( list
      && ($event.dropEffect === "copy"
        || $event.dropEffect === "move") ) {
      let index = $event.index;
      if( typeof index === "undefined" ) {
        index = list.length;
      }
      list.splice( index, 0, $event.data );
    }
  }


  onDragged( index:any, list:any[], effect:DropEffect ) {

    if( effect === "copy" ) {
      list.splice( index, 1 );
    }
  }

  onDragEnd($event: DragEvent) {

  }

  onDragStart($event: DragEvent) {

  }

}
